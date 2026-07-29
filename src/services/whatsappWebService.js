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
const jidTargetMap = new Map();
const lastMsgMap = new Map();

// Registro de Logs en Memoria para depuración gráfica en vivo en el navegador
const logsEnMemoria = [];

function agregarLogMemoria(tipo, mensaje) {
  const timestamp = new Date().toLocaleTimeString('es-CO');
  const logItem = `[${timestamp}] [${tipo.toUpperCase()}] ${mensaje}`;
  console.log(logItem);
  logsEnMemoria.unshift(logItem);
  if (logsEnMemoria.length > 150) {
    logsEnMemoria.pop();
  }
}

function obtenerLogsMemoria() {
  return logsEnMemoria;
}

const authFolder = path.join(__dirname, '../../.baileys_auth');

/**
 * Formatear celular al estándar internacional de Colombia si aplica (+57)
 */
function formatearJidInternacional(telefono) {
  let clean = (telefono || '').toString().replace(/[^\d]/g, '');
  if (!clean) return '';

  if (clean.length === 10 && clean.startsWith('3')) {
    clean = '57' + clean;
  }

  return clean;
}

async function initWhatsAppWeb() {
  if (sock && clientStatus === 'ready') {
    return sock;
  }

  if (sock && clientStatus !== 'ready') {
    try {
      sock.ev.removeAllListeners();
      sock.ws.close();
    } catch (e) {}
    sock = null;
  }

  agregarLogMemoria('info', '⚡ Inicializando motor Baileys WebSocket...');
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
        agregarLogMemoria('qr', '📱 Código QR listo para escanear');
        currentQrCode = qr;
        clientStatus = 'qr_ready';
        qrcodeTerminal.generate(qr, { small: true });

        try {
          currentQrDataUri = await QRCode.toDataURL(qr);
        } catch (err) {
          agregarLogMemoria('error', `Error generando Data URI QR: ${err.message}`);
        }
      }

      if (connection === 'connecting') {
        if (clientStatus !== 'qr_ready') {
          clientStatus = 'initializing';
        }
      }

      if (connection === 'open') {
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
          agregarLogMemoria('exito', `🎉 Sesión WhatsApp lista para: ${userProfile.name} (+${userProfile.phone})`);
        } catch (e) {
          agregarLogMemoria('exito', '🎉 Sesión WhatsApp conectada y lista 100%');
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        agregarLogMemoria('warn', `⚠️ Conexión de WhatsApp cerrada (Código ${statusCode || 'desconocido'})`);

        currentQrCode = null;
        currentQrDataUri = null;
        sock = null;

        if (statusCode === 440 || isLoggedOut) {
          clientStatus = 'disconnected';
          userProfile = null;
          try {
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
            }
          } catch (e) {}
          setTimeout(() => initWhatsAppWeb(), 3000);
        } else {
          clientStatus = 'initializing';
          setTimeout(() => initWhatsAppWeb(), 3000);
        }
      }
    });

    // Escuchar mensajes entrantes en tiempo real sin modificar los JIDs originales del protocolo
    sock.ev.on('messages.upsert', async (m) => {
      if (!m || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue; // Ignorar mensajes salientes enviados por el bot

        const rawJid = msg.key.remoteJid || '';

        // Ignorar Canales (@newsletter), Grupos (@g.us) y Transmisiones
        if (rawJid.includes('@newsletter') || rawJid.includes('@g.us') || rawJid.includes('status@broadcast')) {
          continue;
        }

        const msgId = msg.key.id;
        if (msgId && (processedMsgIds.has(msgId) || botSentMsgIds.has(msgId))) {
          continue;
        }

        const textContent =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.buttonsResponseBodyText ||
          msg.message.listResponseBody?.singleSelectReply?.selectedRowId ||
          msg.message.templateButtonReplyMessage?.selectedId ||
          '';

        const textoLimpio = textContent.trim();
        if (!textoLimpio) continue;

        // Usar la dirección JID intacta como identificador de sesión del chat
        const sessionId = rawJid;
        jidTargetMap.set(sessionId, rawJid);
        lastMsgMap.set(sessionId, msg);

        if (msgId) {
          processedMsgIds.add(msgId);
          if (processedMsgIds.size > 2000) {
            const first = processedMsgIds.values().next().value;
            processedMsgIds.delete(first);
          }
        }

        agregarLogMemoria('recibido', `📩 De ${sessionId}: "${textoLimpio}"`);

        const { procesarMensaje } = require('./conversationService');
        try {
          await procesarMensaje(sessionId, textoLimpio);
        } catch (err) {
          agregarLogMemoria('error', `❌ Error procesando mensaje de ${sessionId}: ${err.message}`);
        }
      }
    });

  } catch (err) {
    agregarLogMemoria('error', `❌ Error inicializando Baileys: ${err.message}`);
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

  const isReady = isWhatsAppWebReady();

  return {
    status: isReady ? 'ready' : clientStatus,
    hasQr: !!currentQrDataUri,
    qrDataUri: currentQrDataUri,
    userProfile
  };
}

function isWhatsAppWebReady() {
  return sock !== null && (clientStatus === 'ready' || !!(sock && sock.user && sock.user.id));
}

async function logoutWhatsAppWeb() {
  agregarLogMemoria('info', '🔴 Cerrando sesión de WhatsApp Web y reiniciando...');
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

async function enviarMensajeWWeb(sessionId, mensaje) {
  let retries = 0;
  while (!isWhatsAppWebReady() && retries < 10) {
    await new Promise((res) => setTimeout(res, 500));
    retries++;
  }

  if (!sock) {
    agregarLogMemoria('error', `❌ No se pudo enviar mensaje a ${sessionId}: Socket desconectado`);
    throw new Error('WhatsApp Web no está listo (el socket está desconectado)');
  }

  // 1. Obtener la dirección JID intacta de WhatsApp sin alterar caracteres
  let targetJid = jidTargetMap.get(sessionId) || sessionId;

  if (!targetJid.includes('@')) {
    const cleanPhone = formatearJidInternacional(targetJid);
    targetJid = `${cleanPhone}@s.whatsapp.net`;
  }

  const quotedMsg = lastMsgMap.get(sessionId) || lastMsgMap.get(targetJid);
  const options = quotedMsg ? { quoted: quotedMsg } : {};

  agregarLogMemoria('enviando', `📤 Enviando respuesta a ${targetJid}...`);

  try {
    const result = await sock.sendMessage(targetJid, { text: mensaje }, options);
    if (result && result.key && result.key.id) {
      botSentMsgIds.add(result.key.id);
    }
    agregarLogMemoria('exito', `✅ Respuesta entregada con éxito a ${targetJid}`);
    return result;
  } catch (err) {
    agregarLogMemoria('error', `❌ Error enviando respuesta a ${targetJid}: ${err.message}`);
    throw err;
  }
}

module.exports = {
  initWhatsAppWeb,
  getWWebStatus,
  isWhatsAppWebReady,
  logoutWhatsAppWeb,
  enviarMensajeWWeb,
  obtenerLogsMemoria
};
