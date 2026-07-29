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

// Registro de Logs en Memoria para depuración gráfica en vivo en el navegador
const logsEnMemoria = [];

function agregarLogMemoria(tipo, mensaje) {
  const timestamp = new Date().toLocaleTimeString('es-CO');
  const logItem = `[${timestamp}] [${tipo.toUpperCase()}] ${mensaje}`;
  console.log(logItem);
  logsEnMemoria.unshift(logItem);
  if (logsEnMemoria.length > 100) {
    logsEnMemoria.pop();
  }
}

function obtenerLogsMemoria() {
  return logsEnMemoria;
}

const authFolder = path.join(__dirname, '../../.baileys_auth');

/**
 * Formatear cualquier número telefónico al estándar internacional de WhatsApp (@s.whatsapp.net)
 */
function formatearJidInternacional(telefono) {
  let clean = (telefono || '').toString().replace(/[^\d]/g, '');
  if (!clean) return '';

  // Si es un número celular de Colombia de 10 dígitos que inicia con 3 (Ej: 3218423914)
  if (clean.length === 10 && clean.startsWith('3')) {
    clean = '57' + clean;
  }

  return clean;
}

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
    const rawDigits = phoneJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    const cleanPhone = formatearJidInternacional(rawDigits);
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
  const cleanId = formatearJidInternacional(rawId);

  // 3. Si es un LID mapeado previamente a un teléfono real
  if (lidToPhoneMap.has(rawId)) {
    const realTel = lidToPhoneMap.get(rawId);
    contactJidMap.set(realTel, `${realTel}@s.whatsapp.net`);
    return realTel;
  }

  const defaultJid = cleanId.length <= 13 ? `${cleanId}@s.whatsapp.net` : remoteJid;
  contactJidMap.set(cleanId, defaultJid);
  return cleanId;
}

async function initWhatsAppWeb() {
  if (sock && clientStatus === 'ready') {
    return sock;
  }

  // Si existe un socket antiguo no listo, cerrarlo limpiamente antes de reconectar
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

    // Escuchar mensajes entrantes de clientes en tiempo real
    sock.ev.on('messages.upsert', async (m) => {
      if (!m || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue; // Ignorar mensajes enviados por el mismo bot

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.includes('@g.us')) continue; // Ignorar chats grupales

        const textContent =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.buttonsResponseBodyText ||
          msg.message.listResponseBody?.singleSelectReply?.selectedRowId ||
          msg.message.templateButtonReplyMessage?.selectedId ||
          '';

        const textoLimpio = textContent.trim();
        if (!textoLimpio) continue;

        const fromNumber = normalizarTelefonoCliente(msg);
        agregarLogMemoria('recibido', `📩 De ${fromNumber}: "${textoLimpio}"`);

        const { procesarMensaje } = require('./conversationService');
        try {
          await procesarMensaje(fromNumber, textoLimpio);
        } catch (err) {
          agregarLogMemoria('error', `❌ Error procesando mensaje de ${fromNumber}: ${err.message}`);
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

async function enviarMensajeWWeb(telefono, mensaje) {
  let retries = 0;
  while (!isWhatsAppWebReady() && retries < 10) {
    await new Promise((res) => setTimeout(res, 500));
    retries++;
  }

  if (!sock) {
    agregarLogMemoria('error', `❌ No se pudo enviar mensaje a ${telefono}: Socket desconectado`);
    throw new Error('WhatsApp Web no está listo (el socket está desconectado)');
  }

  const cleanPhone = formatearJidInternacional(telefono);
  let targetJid = contactJidMap.get(cleanPhone) || contactJidMap.get(telefono);

  if (!targetJid || targetJid.includes('@lid')) {
    if (cleanPhone.length > 13 && lidToPhoneMap.has(cleanPhone)) {
      const realTel = lidToPhoneMap.get(cleanPhone);
      targetJid = `${realTel}@s.whatsapp.net`;
    } else {
      targetJid = `${cleanPhone}@s.whatsapp.net`;
    }
  }

  agregarLogMemoria('enviando', `📤 Enviando a ${cleanPhone} (${targetJid})...`);

  try {
    const result = await sock.sendMessage(targetJid, { text: mensaje });
    if (result && result.key && result.key.id) {
      botSentMsgIds.add(result.key.id);
    }
    agregarLogMemoria('exito', `✅ Mensaje entregado a ${cleanPhone}`);
    return result;
  } catch (err) {
    agregarLogMemoria('warn', `⚠️ Fallo envío primario a ${targetJid}, probando fallback...`);
    const fallbackJid = `${cleanPhone}@s.whatsapp.net`;
    try {
      const result = await sock.sendMessage(fallbackJid, { text: mensaje });
      if (result && result.key && result.key.id) {
        botSentMsgIds.add(result.key.id);
      }
      agregarLogMemoria('exito', `✅ Mensaje entregado vía fallback a ${cleanPhone}`);
      return result;
    } catch (e2) {
      agregarLogMemoria('error', `❌ Error enviando a ${cleanPhone}: ${e2.message}`);
      throw e2;
    }
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
