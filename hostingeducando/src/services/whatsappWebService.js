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
const contactJidMap = new Map();
const lidToPhoneMap = new Map();

const authFolder = path.join(__dirname, '../../.baileys_auth');

/**
 * Resolver teléfono real unificado evitando descalces entre LIDs e identificadores de usuario
 */
function normalizarTelefonoCliente(msg) {
  const remoteJid = msg.key.remoteJid || '';
  const participant = msg.key.participant || '';
  const remoteJidAlt = msg.key.remoteJidAlt || '';

  // 1. Buscar JID que termine en @s.whatsapp.net (teléfono real de WhatsApp)
  const phoneJid = [remoteJidAlt, participant, remoteJid].find(j => j && j.includes('@s.whatsapp.net'));
  
  if (phoneJid) {
    const cleanPhone = phoneJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    if (cleanPhone && cleanPhone.length <= 13) {
      if (remoteJid.includes('@lid')) {
        const lidClean = remoteJid.split('@')[0];
        lidToPhoneMap.set(lidClean, cleanPhone);
      }
      contactJidMap.set(cleanPhone, `${cleanPhone}@s.whatsapp.net`);
      return cleanPhone;
    }
  }

  // 2. Extraer del remoteJid principal
  const rawId = remoteJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
  
  // 3. Si es un LID mapeado previamente a un teléfono real
  if (lidToPhoneMap.has(rawId)) {
    const realTel = lidToPhoneMap.get(rawId);
    contactJidMap.set(realTel, `${realTel}@s.whatsapp.net`);
    return realTel;
  }

  const defaultJid = rawId.length <= 13 ? `${rawId}@s.whatsapp.net` : remoteJid;
  contactJidMap.set(rawId, defaultJid);
  return rawId;
}

async function initWhatsAppWeb() {
  if (sock) {
    return sock;
  }

  console.log('⚡ Inicializando motor ultra-liviano WhatsApp Web (Baileys WebSocket)...');
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
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        console.warn(`⚠️ Conexión de WhatsApp cerrada (Código ${statusCode}). Reorganizando sesión...`);

        currentQrCode = null;
        currentQrDataUri = null;
        sock = null;

        if (isLoggedOut) {
          clientStatus = 'disconnected';
          userProfile = null;
          try {
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
            }
          } catch (e) {}
          setTimeout(() => initWhatsAppWeb(), 2000);
        } else {
          // Código 515 (restartRequired) o reconexión de red normal: Reconectar de inmediato
          clientStatus = 'initializing';
          setTimeout(() => initWhatsAppWeb(), 1000);
        }
      }
    });

    // Escuchar únicamente notificaciones en vivo de mensajes entrantes de clientes
    sock.ev.on('messages.upsert', async (m) => {
      if (!m || m.type !== 'notify' || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;

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

        const fromNumber = normalizarTelefonoCliente(msg);

        const textContent =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.buttonsResponseBodyText ||
          msg.message.listResponseBody?.singleSelectReply?.selectedRowId ||
          '';

        const textoLimpio = textContent.trim();
        if (!textoLimpio) continue;

        console.log(`📩 [WhatsApp Web Baileys] Mensaje en vivo de ${fromNumber}: "${textoLimpio}"`);

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
  // Esperar hasta 5 segundos si el socket está reconectando tras escanear el QR
  let retries = 0;
  while ((!sock || clientStatus !== 'ready') && retries < 10) {
    await new Promise((res) => setTimeout(res, 500));
    retries++;
  }

  if (!sock) {
    throw new Error('WhatsApp Web no está listo (el socket está desconectado)');
  }

  const cleanPhone = telefono.toString().replace(/[^\d]/g, '');
  let targetJid = contactJidMap.get(cleanPhone) || contactJidMap.get(telefono);

  if (!targetJid || targetJid.includes('@lid')) {
    if (cleanPhone.length > 13 && lidToPhoneMap.has(cleanPhone)) {
      const realTel = lidToPhoneMap.get(cleanPhone);
      targetJid = `${realTel}@s.whatsapp.net`;
    } else {
      targetJid = `${cleanPhone}@s.whatsapp.net`;
    }
  }

  console.log(`📤 [WhatsApp Web Baileys] Enviando mensaje a ${cleanPhone} (JID: ${targetJid})...`);

  try {
    const result = await sock.sendMessage(targetJid, { text: mensaje });
    if (result && result.key && result.key.id) {
      botSentMsgIds.add(result.key.id);
    }
    console.log(`📤 [WhatsApp Web Baileys] Mensaje enviado exitosamente a ${cleanPhone}`);
    return result;
  } catch (err) {
    console.warn(`⚠️ Error enviando a ${targetJid}, intentando fallback a @s.whatsapp.net:`, err.message);
    const fallbackJid = `${cleanPhone}@s.whatsapp.net`;
    try {
      const result = await sock.sendMessage(fallbackJid, { text: mensaje });
      if (result && result.key && result.key.id) {
        botSentMsgIds.add(result.key.id);
      }
      console.log(`📤 [WhatsApp Web Baileys] Mensaje enviado exitosamente vía fallback a ${cleanPhone}`);
      return result;
    } catch (e2) {
      console.error(`❌ Error definitivo enviando mensaje a ${cleanPhone}:`, e2.message);
      throw e2;
    }
  }
}

module.exports = {
  initWhatsAppWeb,
  getWWebStatus,
  isWhatsAppWebReady,
  logoutWhatsAppWeb,
  enviarMensajeWWeb
};
