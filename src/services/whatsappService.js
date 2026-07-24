const axios = require('axios');
require('dotenv').config();

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const META_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

/**
 * Envia un mensaje de texto simple a un número de WhatsApp
 */
async function enviarMensajeTexto(to, texto) {
  try {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: {
        preview_url: false,
        body: texto,
      },
    };

    const response = await axios.post(META_URL, data, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(` Mensaje enviado a ${to}: status ${response.status}`);
    return response.data;
  } catch (error) {
    console.error(' Error enviando mensaje a WhatsApp:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Envia una lista interactiva de opciones (ideal para elegir programas de interés)
 */
async function enviarMensajeLista(to, titulo, mensajeHeader, secciones) {
  try {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: mensajeHeader,
        },
        body: {
          text: titulo,
        },
        footer: {
          text: 'Colegio Educando para la Vida',
        },
        action: {
          button: 'Ver Opciones',
          sections: secciones,
        },
      },
    };

    const response = await axios.post(META_URL, data, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(` Lista interactiva enviada a ${to}`);
    return response.data;
  } catch (error) {
    console.error(' Error enviando lista a WhatsApp:', error.response ? error.response.data : error.message);
    // Fallback: enviar como texto simple si falla el mensaje interactivo
    return await enviarMensajeTexto(to, titulo);
  }
}

module.exports = {
  enviarMensajeTexto,
  enviarMensajeLista,
};
