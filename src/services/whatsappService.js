const axios = require('axios');
const { isWhatsAppWebReady, enviarMensajeWWeb } = require('./whatsappWebService');
require('dotenv').config();

function getMetaUrl() {
  const phoneNumberId = (process.env.PHONE_NUMBER_ID || '1150165518190644').trim();
  return `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
}

function getAuthToken() {
  return (process.env.WHATSAPP_TOKEN || '').trim().replace(/^["']|["']$/g, '');
}

/**
 * Envia un mensaje de texto simple a un número de WhatsApp (Híbrido: WhatsApp Web o Meta Cloud API)
 */
async function enviarMensajeTexto(to, texto) {
  // Si la sesión de WhatsApp Web (QR) está conectada y lista, enviar por WhatsApp Web
  if (isWhatsAppWebReady()) {
    try {
      return await enviarMensajeWWeb(to, texto);
    } catch (e) {
      console.warn('⚠️ Falló envío por WhatsApp Web, intentando Meta Cloud API:', e.message);
    }
  }

  // Fallback / Modo predeterminado: Meta Cloud API
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

    console.log(` Mensaje enviado a ${to} (Meta API): status ${response.status}`);
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
  // Si está conectado WhatsApp Web, formatear la lista como texto numerado con emojis
  if (isWhatsAppWebReady()) {
    let textFormatted = `*${mensajeHeader}*\n${titulo}\n\n`;
    secciones.forEach((sec) => {
      if (sec.title) textFormatted += `*${sec.title}*\n`;
      sec.rows.forEach((r, idx) => {
        textFormatted += `${idx + 1}. ${r.title}\n`;
      });
    });
    return await enviarMensajeWWeb(to, textFormatted);
  }

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
    return await enviarMensajeTexto(to, titulo);
  }
}

module.exports = {
  enviarMensajeTexto,
  enviarMensajeLista,
};
