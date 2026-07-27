const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');

let client = null;
let currentQrCode = null;
let currentQrDataUri = null;
let clientStatus = 'disconnected'; // 'disconnected', 'qr_ready', 'authenticated', 'ready'
let userProfile = null;
const processedMsgIds = new Set();

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
      userProfile = {
        name: info.pushname || 'Colegio Educando para la Vida',
        phone: info.wid ? info.wid.user : ''
      };
      console.log(`📱 Sesión iniciada como: ${userProfile.name} (+${userProfile.phone})`);
    } catch (e) {}
  });

  client.on('disconnected', (reason) => {
    console.warn('⚠️ WhatsApp Web desconectado:', reason);
    clientStatus = 'disconnected';
    currentQrCode = null;
    currentQrDataUri = null;
  });

  // Manejar mensajes entrantes (soporta tanto message como message_create)
  async function manejarMensaje(msg) {
    if (!msg || !msg.from || !msg.id || !msg.id.id) return;
    
    // Evitar procesar el mismo mensaje dos veces
    if (processedMsgIds.has(msg.id.id)) return;
    processedMsgIds.add(msg.id.id);
    if (processedMsgIds.size > 1000) processedMsgIds.clear();

    // Solo procesar chats individuales (@c.us), nunca grupos (@g.us)
    if (!msg.from.endsWith('@c.us') && !(msg.to && msg.to.endsWith('@c.us'))) {
      return;
    }

    const texto = msg.body ? msg.body.trim() : '';
    if (!texto) return;

    // Obtener número del remitente
    let fromNumber = msg.from.replace('@c.us', '').replace(/[^\d]/g, '');

    // Si el mensaje es enviado desde el propio celular (Self-Test), procesarlo igual
    if (msg.fromMe) {
      // Si te escribes a ti mismo en WhatsApp
      if (msg.to && msg.to.endsWith('@c.us')) {
        fromNumber = msg.to.replace('@c.us', '').replace(/[^\d]/g, '');
      }
    }

    console.log(`📩 [WhatsApp Web] Mensaje recibido de ${fromNumber}: "${texto}"`);

    const { procesarMensaje } = require('./conversationService');
    try {
      await procesarMensaje(fromNumber, texto);
    } catch (err) {
      console.error(`❌ Error procesando mensaje de ${fromNumber}:`, err.message);
    }
  }

  client.on('message', manejarMensaje);
  client.on('message_create', manejarMensaje);

  client.initialize().catch((err) => {
    console.error('❌ Error inicializando Puppeteer para WhatsApp Web:', err.message);
    clientStatus = 'disconnected';
  });

  return client;
}

function getWWebStatus() {
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

async function enviarMensajeWWeb(to, texto) {
  if (!isWhatsAppWebReady()) {
    throw new Error('WhatsApp Web no está conectado');
  }

  let formattedTo = to.replace(/[^\d]/g, '');
  if (!formattedTo.endsWith('@c.us')) {
    formattedTo = `${formattedTo}@c.us`;
  }

  const res = await client.sendMessage(formattedTo, texto);
  console.log(`📤 [WhatsApp Web] Mensaje enviado a ${to}`);
  return res;
}

module.exports = {
  initWhatsAppWeb,
  getWWebStatus,
  isWhatsAppWebReady,
  enviarMensajeWWeb
};
