const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client = null;
let currentQrCode = null;
let currentQrDataUri = null;
let clientStatus = 'disconnected'; // 'disconnected', 'qr_ready', 'authenticated', 'ready'
let userProfile = null;
const processedMsgIds = new Set();
const botSentMsgIds = new Set();
const contactJidMap = new Map();

function initWhatsAppWeb() {
  if (client) {
    return client;
  }

  console.log('⚡ Inicializando cliente WhatsApp Web (QR Mode)...');
  clientStatus = 'initializing';

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'colegio-bot-session',
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
        '--disable-gpu'
      ]
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
  });

  // Manejar únicamente mensajes entrantes de CLIENTES (Ignorar mensajes propios del Bot)
  async function manejarMensaje(msg) {
    if (!msg || !msg.from || !msg.id || !msg.id.id) return;

    // IGNORED CRÍTICO: Nunca procesar mensajes propios (fromMe) ni emitidos por el propio bot
    if (msg.fromMe || botSentMsgIds.has(msg.id.id)) {
      return;
    }
    
    // Evitar procesar el mismo mensaje dos veces
    if (processedMsgIds.has(msg.id.id)) return;
    processedMsgIds.add(msg.id.id);
    if (processedMsgIds.size > 1000) processedMsgIds.clear();

    // Solo procesar chats individuales (@c.us o @lid), NUNCA grupos (@g.us)
    const isIndividual = (msg.from && (msg.from.endsWith('@c.us') || msg.from.endsWith('@lid')));
    if (!isIndividual) {
      return;
    }

    const texto = msg.body ? msg.body.trim() : '';
    if (!texto) return;

    let targetJid = msg.from;
    let fromNumber = msg.from.replace('@c.us', '').replace('@lid', '').replace(/[^\d]/g, '');

    // Intentar resolver el número de teléfono real del contacto desde WhatsApp
    try {
      const contact = await msg.getContact();
      if (contact && contact.number) {
        fromNumber = contact.number.replace(/[^\d]/g, '');
      }
    } catch (e) {}

    // Mapear el número formateado con su JID real para respuesta garantizada
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

  // Usar únicamente 'message' para ignorar eventos de creación propia
  client.on('message', manejarMensaje);

  client.initialize().catch((err) => {
    console.error('❌ Error inicializando Puppeteer para WhatsApp Web:', err.message);
    clientStatus = 'disconnected';
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

  const sessionPath = path.join(__dirname, '../../.wwebjs_auth');
  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('⚠️ No se pudo borrar la carpeta .wwebjs_auth:', e.message);
  }

  // Generar nuevo cliente para escanear nuevo QR
  initWhatsAppWeb();
  return getWWebStatus();
}

async function enviarMensajeWWeb(to, texto) {
  if (!isWhatsAppWebReady()) {
    throw new Error('WhatsApp Web no está conectado');
  }

  const cleanTo = to.replace(/[^\d]/g, '');
  let targetJid = contactJidMap.get(cleanTo) || contactJidMap.get(to) || `${cleanTo}@c.us`;

  try {
    const res = await client.sendMessage(targetJid, texto);
    if (res && res.id && res.id.id) {
      botSentMsgIds.add(res.id.id);
      if (botSentMsgIds.size > 2000) botSentMsgIds.clear();
    }
    console.log(`📤 [WhatsApp Web] Mensaje enviado exitosamente a ${to}`);
    return res;
  } catch (err) {
    if (targetJid !== `${cleanTo}@c.us`) {
      const fallbackJid = `${cleanTo}@c.us`;
      const res = await client.sendMessage(fallbackJid, texto);
      if (res && res.id && res.id.id) {
        botSentMsgIds.add(res.id.id);
      }
      console.log(`📤 [WhatsApp Web Fallback] Mensaje enviado exitosamente a ${to}`);
      return res;
    }
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
