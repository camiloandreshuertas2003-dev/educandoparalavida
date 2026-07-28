const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Configurar directorio de cache de Puppeteer dentro del proyecto para persistir en Render
const localCacheDir = path.join(process.cwd(), '.cache/puppeteer');
process.env.PUPPETEER_CACHE_DIR = localCacheDir;

let client = null;
let currentQrCode = null;
let currentQrDataUri = null;
let clientStatus = 'disconnected'; // 'disconnected', 'initializing', 'qr_ready', 'authenticated', 'ready'
let userProfile = null;
const processedMsgIds = new Set();
const botSentMsgIds = new Set();
const contactJidMap = new Map();

function findExecutableInFolder(dir, targetName = 'chrome') {
  if (!fs.existsSync(dir)) return null;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const found = findExecutableInFolder(fullPath, targetName);
        if (found) return found;
      } else if (file === targetName && !fullPath.includes('.so') && !fullPath.includes('.png')) {
        return fullPath;
      }
    }
  } catch (e) {}
  return null;
}

function initWhatsAppWeb() {
  if (client) {
    return client;
  }

  console.log('⚡ Inicializando cliente WhatsApp Web (QR Mode)...');
  clientStatus = 'initializing';

  let executablePath = null;

  // 1. Buscar primero en la carpeta de cache local del proyecto ./.cache/puppeteer
  const localChromeBinary = findExecutableInFolder(localCacheDir, 'chrome');
  if (localChromeBinary && fs.existsSync(localChromeBinary)) {
    executablePath = localChromeBinary;
    console.log('🌐 Encontrado binario local persistente de Chrome en:', executablePath);
  }

  // 2. Si no esta en la carpeta local, probar la API de puppeteer
  if (!executablePath) {
    try {
      const puppeteer = require('puppeteer');
      if (puppeteer && typeof puppeteer.executablePath === 'function') {
        const pPath = puppeteer.executablePath();
        if (pPath && fs.existsSync(pPath)) {
          executablePath = pPath;
          console.log('🌐 Usando binario de Puppeteer en:', executablePath);
        }
      }
    } catch (e) {}
  }

  // 3. Probar rutas del sistema Linux si aplica
  if (!executablePath) {
    const systemPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ];

    for (const sysPath of systemPaths) {
      if (fs.existsSync(sysPath)) {
        executablePath = sysPath;
        console.log('🌐 Encontrado ejecutable del sistema en:', executablePath);
        break;
      }
    }
  }

  if (executablePath) {
    console.log('🌐 Ejecutable final de Chrome validado:', executablePath);
  } else {
    console.log('🌐 Usando resolución predeterminada del navegador Puppeteer');
  }

  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
    '--disable-software-rasterizer'
  ];

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'colegio-bot-session',
      dataPath: path.join(__dirname, '../../.wwebjs_auth')
    }),
    puppeteer: {
      headless: true,
      executablePath: executablePath || undefined,
      args: puppeteerArgs,
      timeout: 120000
    }
  });

  client.on('qr', async (qr) => {
    console.log('===================================================');
    console.log('📱 ¡NUEVO CÓDIGO QR GENERADO DE WHATSAPP WEB!');
    console.log('Escanea este código QR con WhatsApp en tu celular:');
    console.log('===================================================');
    
    currentQrCode = qr;
    clientStatus = 'qr_ready';

    qrcodeTerminal.generate(qr, { small: true });

    try {
      currentQrDataUri = await QRCode.toDataURL(qr);
    } catch (err) {
      console.error('Error generando Data URI del QR:', err.message);
    }
  });

  client.on('authenticated', () => {
    console.log('✅ WhatsApp Web Autenticado con éxito');
    clientStatus = 'authenticated';
    currentQrCode = null;
    currentQrDataUri = null;
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Error de Autenticación WhatsApp Web:', msg);
    clientStatus = 'disconnected';
    client = null;
  });

  client.on('ready', async () => {
    console.log('🎉 ¡WHATSAPP WEB CLIENTE LISTO Y CONECTADO 100%!');
    clientStatus = 'ready';
    currentQrCode = null;
    currentQrDataUri = null;

    try {
      const info = client.info;
      const cleanMyPhone = info.wid ? info.wid.user : '';
      userProfile = {
        name: info.pushname || 'Colegio Educando para la Vida',
        phone: cleanMyPhone
      };
      if (cleanMyPhone && info.wid._serialized) {
        contactJidMap.set(cleanMyPhone, info.wid._serialized);
      }
      console.log(`📱 Sesión iniciada como: ${userProfile.name} (+${userProfile.phone})`);
    } catch (e) {}
  });

  client.on('disconnected', (reason) => {
    console.warn('⚠️ WhatsApp Web desconectado:', reason);
    clientStatus = 'disconnected';
    currentQrCode = null;
    currentQrDataUri = null;
    client = null;
  });

  // Manejar únicamente mensajes entrantes de CLIENTES
  async function manejarMensaje(msg) {
    if (!msg || !msg.body) return;

    if (msg.fromMe || (msg.id && msg.id.fromMe)) {
      return;
    }

    const msgIdStr = msg.id ? (msg.id.id || msg.id._serialized) : null;
    if (msgIdStr && (processedMsgIds.has(msgIdStr) || botSentMsgIds.has(msgIdStr))) {
      return;
    }
    if (msgIdStr) {
      processedMsgIds.add(msgIdStr);
      if (processedMsgIds.size > 2000) {
        const first = processedMsgIds.values().next().value;
        processedMsgIds.delete(first);
      }
    }

    const texto = msg.body.trim();
    if (!texto) return;

    let targetJid = msg.from;
    let fromNumber = msg.from.replace(/[^\d]/g, '');

    try {
      const contact = await msg.getContact();
      if (contact && contact.number) {
        fromNumber = contact.number.replace(/[^\d]/g, '');
      }
    } catch (e) {}

    contactJidMap.set(fromNumber, targetJid);
    contactJidMap.set(msg.from, targetJid);

    console.log(`📩 [WhatsApp Web] Mensaje entrante de cliente ${fromNumber}: "${texto}"`);

    const { procesarMensaje } = require('./conversationService');
    try {
      await procesarMensaje(fromNumber, texto);
    } catch (err) {
      console.error(`❌ Error procesando mensaje de ${fromNumber}:`, err.message);
    }
  }

  client.on('message', manejarMensaje);

  client.initialize().catch((err) => {
    console.error('❌ Error inicializando Puppeteer para WhatsApp Web:', err.message);
    clientStatus = 'disconnected';
    client = null;
  });

  return client;
}

function getWWebStatus() {
  if (clientStatus === 'disconnected' && !client) {
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
  return clientStatus === 'ready' && client !== null;
}

async function logoutWhatsAppWeb() {
  console.log('🔴 Cerrando sesión de WhatsApp Web y borrando credenciales...');
  if (client) {
    try {
      await client.logout();
    } catch (e) {}
    try {
      await client.destroy();
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
  if (!isWhatsAppWebReady()) {
    throw new Error('WhatsApp Web no está autenticado o listo');
  }

  const cleanPhone = telefono.toString().replace(/[^\d]/g, '');
  let targetJid = contactJidMap.get(cleanPhone) || contactJidMap.get(telefono) || `${cleanPhone}@c.us`;

  console.log(`📤 [WhatsApp Web] Enviando mensaje a ${cleanPhone} (JID: ${targetJid})...`);

  try {
    const result = await client.sendMessage(targetJid, mensaje);
    if (result && result.id && (result.id.id || result.id._serialized)) {
      botSentMsgIds.add(result.id.id || result.id._serialized);
    }
    console.log(`📤 [WhatsApp Web] Mensaje enviado exitosamente a ${cleanPhone}`);
    return result;
  } catch (err) {
    console.warn(`⚠️ Error enviando a JID ${targetJid}, intentando fallback a @c.us:`, err.message);
    const fallbackJid = `${cleanPhone}@c.us`;
    const result = await client.sendMessage(fallbackJid, mensaje);
    if (result && result.id && (result.id.id || result.id._serialized)) {
      botSentMsgIds.add(result.id.id || result.id._serialized);
    }
    return result;
  }
}

module.exports = {
  initWhatsAppWeb,
  getWWebStatus,
  isWhatsAppWebReady,
  logoutWhatsAppWeb,
  enviarMensajeWWeb
};
