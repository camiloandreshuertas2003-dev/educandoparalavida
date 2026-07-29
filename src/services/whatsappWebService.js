const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client = null;
let currentQrCode = null;
let currentQrDataUri = null;
let clientStatus = 'disconnected'; // 'disconnected', 'initializing', 'qr_ready', 'ready'
let userProfile = null;

const logsEnMemoria = [];
const activeChats = new Map();

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

function formatearJidInternacional(telefono) {
  let clean = (telefono || '').toString().replace(/[^\d]/g, '');
  if (!clean) return '';
  if (clean.length === 10 && clean.startsWith('3')) {
    clean = '57' + clean;
  }
  return clean;
}

async function initWhatsAppWeb() {
  if (client && clientStatus === 'ready') {
    return client;
  }

  if (client) {
    try {
      await client.destroy();
    } catch (e) {}
    client = null;
  }

  agregarLogMemoria('info', '⚡ Inicializando motor Chromium WhatsApp Web (whatsapp-web.js)...');
  clientStatus = 'initializing';

  try {
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'bot-colegio-session',
        dataPath: path.join(__dirname, '../../.wwebjs_auth')
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--unhandled-rejections=strict'
        ]
      }
    });

    client.on('qr', async (qr) => {
      agregarLogMemoria('qr', '📱 Código QR listo para escanear en WhatsApp Web');
      currentQrCode = qr;
      clientStatus = 'qr_ready';
      qrcodeTerminal.generate(qr, { small: true });

      try {
        currentQrDataUri = await QRCode.toDataURL(qr);
      } catch (err) {
        agregarLogMemoria('error', `Error generando Data URI QR: ${err.message}`);
      }
    });

    client.on('ready', async () => {
      clientStatus = 'ready';
      currentQrCode = null;
      currentQrDataUri = null;

      try {
        const info = client.info;
        userProfile = {
          name: info ? (info.pushname || 'Colegio Educando para la Vida') : 'Colegio Educando para la Vida',
          phone: info ? (info.wid ? info.wid.user : '') : ''
        };
        agregarLogMemoria('exito', `🎉 Sesión WhatsApp Web lista para: ${userProfile.name} (+${userProfile.phone})`);
      } catch (e) {
        agregarLogMemoria('exito', '🎉 Sesión WhatsApp Web conectada y lista 100%');
      }
    });

    client.on('disconnected', (reason) => {
      agregarLogMemoria('warn', `⚠️ Sesión de WhatsApp desconectada: ${reason}`);
      clientStatus = 'disconnected';
      currentQrCode = null;
      currentQrDataUri = null;
      userProfile = null;
      client = null;
      setTimeout(() => initWhatsAppWeb(), 3000);
    });

    client.on('message', async (msg) => {
      try {
        if (msg.fromMe) return;

        const chat = await msg.getChat();
        if (chat.isGroup) return; // Ignorar grupos

        const fromNumber = formatearJidInternacional(msg.from.split('@')[0]);
        const textContent = (msg.body || '').trim();

        if (!textContent) return;

        activeChats.set(fromNumber, msg);
        activeChats.set(msg.from, msg);

        agregarLogMemoria('recibido', `📩 De ${fromNumber} (${msg.from}): "${textContent}"`);

        const { procesarMensaje } = require('./conversationService');
        await procesarMensaje(fromNumber || msg.from, textContent);
      } catch (err) {
        agregarLogMemoria('error', `❌ Error procesando mensaje: ${err.message}`);
      }
    });

    await client.initialize();
  } catch (err) {
    agregarLogMemoria('error', `❌ Error inicializando whatsapp-web.js: ${err.message}`);
    clientStatus = 'disconnected';
    client = null;
  }

  return client;
}

function getWWebStatus() {
  if (clientStatus === 'disconnected' && !client) {
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
  return client !== null && clientStatus === 'ready';
}

async function logoutWhatsAppWeb() {
  agregarLogMemoria('info', '🔴 Cerrando sesión de WhatsApp Web y reiniciando...');
  if (client) {
    try {
      await client.logout();
    } catch (e) {}
    client = null;
  }

  clientStatus = 'disconnected';
  currentQrCode = null;
  currentQrDataUri = null;
  userProfile = null;

  try {
    const authPath = path.join(__dirname, '../../.wwebjs_auth');
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
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

  if (!client) {
    agregarLogMemoria('error', `❌ No se pudo enviar mensaje a ${telefono}: Cliente desconectado`);
    throw new Error('WhatsApp Web no está listo');
  }

  const cleanPhone = formatearJidInternacional(telefono);
  const activeMsg = activeChats.get(telefono) || activeChats.get(cleanPhone);

  agregarLogMemoria('enviando', `📤 Enviando respuesta a ${cleanPhone || telefono}...`);

  try {
    if (activeMsg) {
      await activeMsg.reply(mensaje);
      agregarLogMemoria('exito', `✅ Respuesta citada y entregada con éxito a ${cleanPhone || telefono}`);
    } else {
      const targetJid = cleanPhone.length <= 13 ? `${cleanPhone}@c.us` : (telefono.includes('@') ? telefono : `${cleanPhone}@c.us`);
      await client.sendMessage(targetJid, mensaje);
      agregarLogMemoria('exito', `✅ Mensaje entregado con éxito a ${targetJid}`);
    }
  } catch (err) {
    agregarLogMemoria('warn', `⚠️ Fallo envío primario, probando fallback a @c.us: ${err.message}`);
    const fallbackJid = `${cleanPhone}@c.us`;
    try {
      await client.sendMessage(fallbackJid, mensaje);
      agregarLogMemoria('exito', `✅ Mensaje entregado vía fallback a ${fallbackJid}`);
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
