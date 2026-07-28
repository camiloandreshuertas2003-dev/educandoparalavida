const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

let sock = null;
let currentQrCode = null;
let currentQrDataUri = null;
let clientStatus = 'disconnected'; // 'disconnected', 'initializing', 'qr_ready', 'authenticated', 'ready'
let userProfile = null;
const processedMsgIds = new Set();
const botSentMsgIds = new Set();

const authFolder = path.join(__dirname, '../../.baileys_auth');

async function initWhatsAppWeb() {
  if (sock) {
    return sock;
  }

  console.log('⚡ Inicializando motor ultra-liviano WhatsApp Web (Baileys WebSocket 35MB RAM)...');
  clientStatus = 'initializing';

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Educando para la Vida', 'Chrome', '1.0.0'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('===================================================');
        console.log('📱 ¡NUEVO CÓDIGO QR GENERADO DE WHATSAPP WEB!');
        console.log('===================================================');
        currentQrCode = qr;
        clientStatus = 'qr_ready';
        qrcodeTerminal.generate(qr, { small: true });

        try {
          currentQrDataUri = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error('Error generando Data URI del QR:', err.message);
        }
      }

      if (connection === 'connecting') {
        if (clientStatus !== 'qr_ready') {
          clientStatus = 'initializing';
        }
      }

      if (connection === 'open') {
        console.log('🎉 ¡WHATSAPP WEB CLIENTE LISTO Y CONECTADO 100%! (Baileys WebSocket Active)');
        clientStatus = 'ready';
        currentQrCode = null;
        currentQrDataUri = null;

        try {
          const userJid = sock.user ? sock.user.id : '';
          const cleanPhone = userJid ? userJid.split(':')[0].split('@')[0] : '';
          userProfile = {
            name: sock.user ? (sock.user.name || 'Colegio Educando para la Vida') : 'Colegio Educando para la Vida',
            phone: cleanPhone
          };
          console.log(`📱 Sesión iniciada como: ${userProfile.name} (+${userProfile.phone})`);
        } catch (e) {}
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.warn(`⚠️ Conexión de WhatsApp cerrada (Código ${statusCode}). Reorganizando: ${shouldReconnect}`);

        clientStatus = 'disconnected';
        currentQrCode = null;
        currentQrDataUri = null;
        sock = null;

        if (statusCode === DisconnectReason.loggedOut) {
          try {
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
            }
          } catch (e) {}
        }

        if (shouldReconnect) {
          setTimeout(() => {
            initWhatsAppWeb();
          }, 3000);
        }
      }
    });

    // Escuchar únicamente mensajes entrantes de clientes
    sock.ev.on('messages.upsert', async (m) => {
      if (!m || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue; // Ignorar mensajes propios del bot

        const msgId = msg.key.id;
        if (msgId && (processedMsgIds.has(msgId) || botSentMsgIds.has(msgId))) {
          continue;
        }
        if (msgId) {
          processedMsgIds.add(msgId);
          if (processedMsgIds.size > 2000) {
            const first = processedMsgIds.values().next().value;
            processedMsgIds.delete(first);
          }
        }

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.includes('@g.us')) continue; // Ignorar grupos

        const fromNumber = remoteJid.replace(/[^\d]/g, '');
        const textContent =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.buttonsResponseBodyText ||
          '';

        const textoLimpio = textContent.trim();
        if (!textoLimpio) continue;

        console.log(`📩 [WhatsApp Web Baileys] Mensaje entrante de cliente ${fromNumber}: "${textoLimpio}"`);

        const { procesarMensaje } = require('./conversationService');
        try {
          await procesarMensaje(fromNumber, textoLimpio);
        } catch (err) {
          console.error(`❌ Error procesando mensaje de ${fromNumber}:`, err.message);
        }
      }
    });

  } catch (err) {
    console.error('❌ Error inicializando Baileys WhatsApp:', err.message);
    clientStatus = 'disconnected';
    sock = null;
  }

  return sock;
}

function getWWebStatus() {
  if (clientStatus === 'disconnected' && !sock) {
    try {
      initWhatsAppWeb();
    } catch (e) {}
  }
  return {
    status: clientStatus,
    hasQr: !!currentQrDataUri,
    qrDataUri: currentQrDataUri,
    userProfile
  };
}

function isWhatsAppWebReady() {
  return clientStatus === 'ready' && sock !== null;
}

async function logoutWhatsAppWeb() {
  console.log('🔴 Cerrando sesión de WhatsApp Web y eliminando credenciales Baileys...');
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {}
    sock = null;
  }

  clientStatus = 'disconnected';
  currentQrCode = null;
  currentQrDataUri = null;
  userProfile = null;

  try {
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }
  } catch (e) {}

  setTimeout(() => {
    initWhatsAppWeb();
  }, 2000);

  return { status: 'disconnected', message: 'Sesión de WhatsApp cerrada exitosamente' };
}

async function enviarMensajeWWeb(telefono, mensaje) {
  if (!isWhatsAppWebReady()) {
    throw new Error('WhatsApp Web no está listo o conectado');
  }

  const cleanPhone = telefono.toString().replace(/[^\d]/g, '');
  const targetJid = `${cleanPhone}@s.whatsapp.net`;

  console.log(`📤 [WhatsApp Web Baileys] Enviando mensaje a ${cleanPhone}...`);

  try {
    const result = await sock.sendMessage(targetJid, { text: mensaje });
    if (result && result.key && result.key.id) {
      botSentMsgIds.add(result.key.id);
    }
    console.log(`📤 [WhatsApp Web Baileys] Mensaje enviado exitosamente a ${cleanPhone}`);
    return result;
  } catch (err) {
    console.error(`❌ Error enviando mensaje a ${cleanPhone}:`, err.message);
    throw err;
  }
}

module.exports = {
  initWhatsAppWeb,
  getWWebStatus,
  isWhatsAppWebReady,
  logoutWhatsAppWeb,
  enviarMensajeWWeb
};
