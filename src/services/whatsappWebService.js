const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion, makeInMemoryStore } = require('@whiskeysockets/baileys');
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
const storeFilePath = path.join(__dirname, '../../.baileys_store.json');

// Tienda en memoria oficial de Baileys para resolver LIDs a celulares reales
const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

try {
  if (fs.existsSync(storeFilePath)) {
    store.readFromFile(storeFilePath);
  }
} catch (e) {}

setInterval(() => {
  try {
    store.writeToFile(storeFilePath);
  } catch (e) {}
}, 10000);

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

/**
 * Resolver la dirección real de celular (@s.whatsapp.net) consultando el Baileys Store y los metadatos del mensaje
 */
function resolverJidReal(remoteJid, msg) {
  if (!remoteJid) return null;

  // 1. Si remoteJid ya es una dirección de celular directa
  if (remoteJid.includes('@s.whatsapp.net')) {
    const rawDigits = remoteJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    const cleanPhone = formatearJidInternacional(rawDigits);
    contactJidMap.set(cleanPhone, remoteJid);
    contactJidMap.set(remoteJid, remoteJid);
    return remoteJid;
  }

  // 2. Buscar en el catálogo en memoria de Baileys Store
  if (store && store.contacts) {
    const contact = store.contacts[remoteJid];
    if (contact && contact.id && contact.id.includes('@s.whatsapp.net')) {
      const realJid = contact.id;
      const rawDigits = realJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
      const cleanPhone = formatearJidInternacional(rawDigits);
      agregarLogMemoria('info', `🔎 Baileys Store resolvió ${remoteJid} -> ${realJid}`);
      contactJidMap.set(cleanPhone, realJid);
      contactJidMap.set(remoteJid, realJid);
      return realJid;
    }
  }

  // 3. Buscar en metadatos del mensaje (remoteJidAlt o participant)
  const participant = msg?.key?.participant || msg?.participant || '';
  const remoteJidAlt = msg?.key?.remoteJidAlt || '';

  const candidates = [remoteJidAlt, participant].filter(j => j && typeof j === 'string' && j.includes('@s.whatsapp.net'));
  if (candidates.length > 0) {
    const realJid = candidates[0];
    const rawDigits = realJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    const cleanPhone = formatearJidInternacional(rawDigits);
    contactJidMap.set(cleanPhone, realJid);
    contactJidMap.set(remoteJid, realJid);
    return realJid;
  }

  // 4. Fallback si es un LID puro
  const rawLid = remoteJid.split('@')[0];
  contactJidMap.set(remoteJid, remoteJid);
  contactJidMap.set(rawLid, remoteJid);
  return remoteJid;
}

/**
 * Normalizar identificador de cliente para el flujo de la maquina de estados
 */
function normalizarJidCliente(msg) {
  const remoteJid = msg.key.remoteJid || '';

  if (remoteJid.includes('@newsletter') || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
    return null;
  }

  const realJid = resolverJidReal(remoteJid, msg);
  const rawDigits = realJid ? realJid.split('@')[0].split(':')[0].replace(/[^\d]/g, '') : remoteJid.split('@')[0];
  const cleanPhone = formatearJidInternacional(rawDigits);
  return cleanPhone || rawDigits;
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

  agregarLogMemoria('info', '⚡ Inicializando motor Baileys WebSocket con Store en disco...');
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

    // Vincular la tienda de contactos a los eventos de la sesión
    store.bind(sock.ev);

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

    // Escuchar mensajes entrantes en tiempo real
    sock.ev.on('messages.upsert', async (m) => {
      if (!m || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue; // Ignorar mensajes salientes enviados por el bot

        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid.includes('@newsletter') || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
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

        const fromNumber = normalizarJidCliente(msg);
        if (!fromNumber) continue;

        const realJid = resolverJidReal(remoteJid, msg);

        // Guardar estructura de mensaje entrante para citar respuesta
        lastMsgMap.set(fromNumber, msg);
        lastMsgMap.set(remoteJid, msg);
        if (realJid) lastMsgMap.set(realJid, msg);

        if (msgId) {
          processedMsgIds.add(msgId);
          if (processedMsgIds.size > 2000) {
            const first = processedMsgIds.values().next().value;
            processedMsgIds.delete(first);
          }
        }

        agregarLogMemoria('recibido', `📩 De ${fromNumber} (JID: ${realJid || remoteJid}): "${textoLimpio}"`);

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
    if (fs.existsSync(storeFilePath)) {
      fs.rmSync(storeFilePath, { force: true });
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

  // 1. Determinar el JID primario priorizando el número telefónico real @s.whatsapp.net o la dirección mapeada en store
  let targetJid = contactJidMap.get(telefono) || contactJidMap.get(cleanPhone);
  if (!targetJid) {
    if (cleanPhone && cleanPhone.length <= 13 && !cleanPhone.includes('@')) {
      targetJid = `${cleanPhone}@s.whatsapp.net`;
    } else {
      targetJid = telefono;
    }
  }

  const quotedMsg = lastMsgMap.get(telefono) || lastMsgMap.get(cleanPhone) || lastMsgMap.get(targetJid);
  const options = quotedMsg ? { quoted: quotedMsg } : {};

  agregarLogMemoria('enviando', `📤 Enviando respuesta a ${cleanPhone} (${targetJid})...`);

  try {
    const result = await sock.sendMessage(targetJid, { text: mensaje }, options);
    if (result && result.key && result.key.id) {
      botSentMsgIds.add(result.key.id);
    }
    agregarLogMemoria('exito', `✅ Respuesta entregada con éxito a ${targetJid}`);
    return result;
  } catch (err) {
    agregarLogMemoria('warn', `⚠️ Fallo envío a ${targetJid}, probando fallback a @s.whatsapp.net...`);
    const fallbackJid = `${cleanPhone}@s.whatsapp.net`;
    try {
      const result = await sock.sendMessage(fallbackJid, { text: mensaje }, options);
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
