const axios = require('axios');
require('dotenv').config();

function getMetaUrl() {
  const phoneNumberId = process.env.PHONE_NUMBER_ID || '1150165518190644';
  return `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
}

function getAuthToken() {
  return process.env.WHATSAPP_TOKEN || '';
}

/**
 * Envia un mensaje de texto simple a un número de WhatsApp
 */
async function enviarMensajeTexto(to, texto) {
  try {
    const url = getMetaUrl();
    const token = getAuthToken();

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

    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${token}`,
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
    const url = getMetaUrl();
    const token = getAuthToken();

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

    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${token}`,
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
