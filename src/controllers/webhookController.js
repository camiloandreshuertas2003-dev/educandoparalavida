const crypto = require('crypto');
const { procesarMensaje } = require('../services/conversationService');
require('dotenv').config();

const VERIFY_TOKEN = (process.env.VERIFY_TOKEN || 'colegio_bot_secret_token_2026').trim();
const APP_SECRET = process.env.APP_SECRET ? process.env.APP_SECRET.trim() : null;

/**
 * Validar la firma X-Hub-Signature-256 enviada por Meta
 */
function validarFirmaMeta(req) {
  if (!APP_SECRET) {
    return true;
  }

  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader) {
    return true;
  }

  try {
    const signatureParts = signatureHeader.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      return true;
    }

    const signature = signatureParts[1];
    const payload = req.rawBody || JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', APP_SECRET)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
  } catch (e) {
    return true;
  }
}

/**
 * GET /webhook
 * Endpoint de verificación de Meta y estado del webhook
 */
function verificarWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log(' Webhook verificado con éxito por Meta');
      return res.status(200).send(challenge);
    } else {
      console.error(' Error en verificación del webhook: token incorrecto');
      return res.status(403).send('Forbidden: Token no coincide');
    }
  }

  return res.status(200).json({
    status: 'online',
    endpoint: 'WhatsApp Webhook Endpoint',
    description: 'Escuchador activo de eventos de Meta WhatsApp Cloud API',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /webhook
 * Endpoint que recibe notificaciones de mensajes desde WhatsApp Cloud API
 */
async function recibirMensaje(req, res) {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {}
    }

    if (!body || typeof body !== 'object') {
      return res.status(200).send('EVENT_RECEIVED');
    }

    console.log(' Webhook Payload Recibido:', JSON.stringify(body));

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (value && value.messages && value.messages.length > 0) {
          for (const msg of value.messages) {
            const from = msg.from; // Número del remitente

            let textoMensaje = '';

            if (msg.type === 'text') {
              textoMensaje = msg.text ? msg.text.body : '';
            } else if (msg.type === 'interactive') {
              if (msg.interactive.type === 'list_reply') {
                textoMensaje = msg.interactive.list_reply.title || msg.interactive.list_reply.id;
              } else if (msg.interactive.type === 'button_reply') {
                textoMensaje = msg.interactive.button_reply.title || msg.interactive.button_reply.id;
              }
            } else if (msg.type === 'button') {
              textoMensaje = msg.button ? msg.button.text : '';
            }

            console.log(` PROCESANDO MENSAJE ENTRANTE de ${from}: "${textoMensaje}"`);

            // IMPORTANTE: En Vercel Serverless se DEBE esperar el procesamiento ANTES de enviar res.send()
            // De lo contrario Vercel congela el proceso Serverless antes de que se envíe la respuesta por WhatsApp
            try {
              await procesarMensaje(from, textoMensaje);
            } catch (errProc) {
              console.error(` Error en procesarMensaje para ${from}:`, errProc);
            }
          }
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error(' Error en procesamiento interno de POST /webhook:', error);
    return res.status(200).send('EVENT_RECEIVED');
  }
}

module.exports = {
  verificarWebhook,
  recibirMensaje,
};
