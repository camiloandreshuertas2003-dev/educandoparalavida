const { procesarMensaje } = require('../services/conversationService');
require('dotenv').config();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'colegio_bot_secret_token_2026';

/**
 * GET /webhook
 * Endpoint de verificación exigido por Meta for Developers
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
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
}

/**
 * POST /webhook
 * Endpoint que recibe notificaciones de mensajes desde WhatsApp Cloud API
 */
async function recibirMensaje(req, res) {
  try {
    const body = req.body;

    // Verificar si es un evento de WhatsApp Cloud API
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry && body.entry[0];
      const changes = entry && entry.changes && entry.changes[0];
      const value = changes && changes.value;
      const messages = value && value.messages;

      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from; // Número del remitente

        let textoMensaje = '';

        if (msg.type === 'text') {
          textoMensaje = msg.text ? msg.text.body : '';
        } else if (msg.type === 'interactive') {
          if (msg.interactive.type === 'list_reply') {
            textoMensaje = msg.interactive.list_reply.title;
          } else if (msg.interactive.type === 'button_reply') {
            textoMensaje = msg.interactive.button_reply.title;
          }
        }

        console.log(` Mensaje recibido de ${from}: "${textoMensaje}"`);

        // IMPORTANTE PARA VERCEL SERVERLESS:
        // Await completo de la función para evitar congelamiento de la lambda antes de enviar el mensaje a Meta
        await procesarMensaje(from, textoMensaje);
      }

      // Meta exige responder 200 OK
      return res.status(200).send('EVENT_RECEIVED');
    }

    res.sendStatus(404);
  } catch (error) {
    console.error(' Error en POST /webhook:', error);
    // Responder 200 a Meta para evitar reintentos fallidos desmedidos
    return res.status(200).send('EVENT_RECEIVED');
  }
}

module.exports = {
  verificarWebhook,
  recibirMensaje,
};
