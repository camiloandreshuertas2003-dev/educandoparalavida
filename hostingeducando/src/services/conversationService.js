const pool = require('../config/db');
const { enviarMensajeWWeb } = require('./whatsappWebService');

// Memoria de respaldo para sincronizar estados si la base de datos MySQL está en reconexión
const estadosEnMemoria = new Map();

/**
 * Normalizar texto para tolerar tildes, mayúsculas y caracteres especiales
 */
function normalizarTexto(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, '')
    .replace(/presio|precio|presyo|costo|costos|kual|cual|cuanto|kwanto/g, 'precio')
    .replace(/vibo|vivo|bibo|clas|clase|clases|en vivo/g, 'vivo')
    .replace(/titulo|titulos|oficial|valido|men|icfes/g, 'titulo')
    .replace(/requisit|requisito|requisitos|papeles|documento|documentos/g, 'requisito')
    .trim();
}

/**
 * Helper para enviar mensajes de texto a través del motor de WhatsApp activo
 */
async function enviarTexto(telefono, mensaje) {
  try {
    await enviarMensajeWWeb(telefono, mensaje);
  } catch (err) {
    console.error(`❌ Error enviando mensaje de WhatsApp a ${telefono}:`, err.message);
  }
}

/**
 * Obtener texto administrable desde la tabla `bot_mensajes` en MySQL
 */
async function obtenerTextoBot(clave, fallbackDefault) {
  try {
    const [rows] = await pool.query('SELECT contenido FROM bot_mensajes WHERE clave = ? AND activo = TRUE', [clave]);
    if (rows && rows.length > 0 && rows[0].contenido) {
      return rows[0].contenido;
    }
  } catch (err) {}
  return fallbackDefault;
}

/**
 * Buscar respuestas dinámicas en la tabla `base_conocimiento` (FAQs) en MySQL
 */
async function buscarEnBaseConocimiento(mensajeTexto) {
  if (!mensajeTexto) return null;
  const textoNorm = normalizarTexto(mensajeTexto);

  try {
    const [faqs] = await pool.query('SELECT pregunta_frecuente, respuesta_aprobada FROM base_conocimiento WHERE activo = TRUE');
    if (faqs && faqs.length > 0) {
      for (const faq of faqs) {
        const pregNorm = normalizarTexto(faq.pregunta_frecuente);
        const keywords = pregNorm.split(/\s+/).filter(w => w.length > 3);
        const matchCount = keywords.filter(k => textoNorm.includes(k)).length;

        if (matchCount >= 1 ||
            (textoNorm.includes('precio') && pregNorm.includes('precio')) ||
            (textoNorm.includes('vivo') && pregNorm.includes('vivo')) ||
            (textoNorm.includes('titulo') && pregNorm.includes('titulo')) ||
            (textoNorm.includes('requisito') && pregNorm.includes('requisito'))) {
          return faq.respuesta_aprobada;
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Nota consultando Base de Conocimiento en MySQL:', err.message);
  }

  // Respuestas predeterminadas si la BD está en inicialización
  if (textoNorm.includes('precio')) {
    return '💡 En el Colegio Virtual Educando para la Vida 🎓 los costos son muy accesibles. Ofrecemos mensualidades económicas con facilidades de pago 💸. Al registrar sus datos, le enviaremos la tarifa exacta para su grado 📚.';
  }
  if (textoNorm.includes('vivo')) {
    return '💻 Ofrecemos un modelo flexible 100% virtual con plataforma 24/7, clases en vivo interactivas 🎥 y tutorías personalizadas para aprender a su propio ritmo ✨.';
  }
  if (textoNorm.includes('titulo')) {
    return '📜 Contamos con resolución oficial expedida por la Secretaría de Educación conforme a la Ley 115. El título de Bachiller es 100% legal y válido para ingresar a cualquier universidad 🏛️✨.';
  }
  if (textoNorm.includes('requisito')) {
    return '📋 Se requiere fotocopia del documento de identidad del estudiante y acudiente 📄, certificado del último año cursado y recibo de pago de matrícula ✍️.';
  }

  return null;
}

/**
 * Obtener oferta académica directamente desde la tabla `grados` en MySQL
 */
async function obtenerGradosDinamicos() {
  try {
    const [rows] = await pool.query('SELECT id, nombre FROM grados WHERE activo = TRUE ORDER BY orden ASC LIMIT 10');
    if (rows && rows.length > 0) {
      return rows;
    }
  } catch (err) {}

  return [
    { id: 1, nombre: 'Preescolar / Transición 🎨' },
    { id: 2, nombre: 'Primaria (1° a 5°) ✏️' },
    { id: 3, nombre: 'Secundaria (6° a 9°) 📘' },
    { id: 4, nombre: 'Media Académica (10° y 11°) 🎓' },
    { id: 5, nombre: 'Bachillerato por Ciclos (CLEI) 🌟' },
  ];
}

/**
 * Enviar lista de oferta académica de grados desde MySQL
 */
async function enviarListaGrados(telefono) {
  const grados = await obtenerGradosDinamicos();
  let msg = '🎓 Seleccione el *Grado Educativo* de su interés enviando el número correspondiente 👇:\n\n';
  grados.forEach((g, idx) => {
    msg += `${idx + 1}. ${g.nombre}\n`;
  });
  msg += '\n👉 *Responda únicamente con el número de su opción (Ejemplo: 2)*';

  await enviarTexto(telefono, msg);
  await registrarLog(telefono, 'saliente', msg);
}

/**
 * Obtener estado de la conversación desde MySQL
 */
async function obtenerEstadoConversacion(telefono) {
  try {
    const [rows] = await pool.query('SELECT * FROM conversaciones WHERE telefono = ?', [telefono]);
    if (rows && rows.length > 0) {
      const estadoBD = rows[0];
      estadosEnMemoria.set(telefono, estadoBD);
      return estadoBD;
    }
  } catch (error) {}

  if (estadosEnMemoria.has(telefono)) {
    return estadosEnMemoria.get(telefono);
  }

  const nuevoEstado = {
    telefono,
    paso_actual: 'inicio',
    nombre_temp: null,
    apellido_temp: null,
    telefono_temp: telefono,
    programa_temp: null,
  };
  estadosEnMemoria.set(telefono, nuevoEstado);
  return nuevoEstado;
}

/**
 * Actualizar atómicamente la conversación en MySQL y Memoria
 */
async function actualizarConversacion(telefono, nuevosCampos) {
  const actual = estadosEnMemoria.get(telefono) || { telefono, paso_actual: 'inicio', telefono_temp: telefono };
  const actualizado = { ...actual, ...nuevosCampos };
  estadosEnMemoria.set(telefono, actualizado);

  try {
    const fields = Object.keys(nuevosCampos);
    if (fields.length === 0) return;

    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const updateValues = fields.map((f) => nuevosCampos[f]);

    const insertFields = ['telefono', ...fields].join(', ');
    const placeholders = ['?', ...fields.map(() => '?')].join(', ');
    const insertValues = [telefono, ...updateValues];

    const sql = `
      INSERT INTO conversaciones (${insertFields})
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${setClause}, actualizado_en = NOW()
    `;

    await pool.query(sql, [...insertValues, ...updateValues]);
  } catch (error) {}
}

/**
 * Guardar Lead final en las tablas `leads_fase2` y `leads` de MySQL
 */
async function guardarLead(telefono, nombreCompleto, gradoId, gradoTexto) {
  try {
    let puntaje = 30;
    if (nombreCompleto) puntaje += 20;

    const partes = (nombreCompleto || '').trim().split(/\s+/);
    const nombre = partes[0] || 'Interesado';
    const apellido = partes.slice(1).join(' ') || '';
    const cleanTel = (telefono || 'Sin número').toString().trim();

    await pool.query(
      `INSERT INTO leads_fase2 (telefono, nombre_contacto, apellido_contacto, grado_interes_id, habeas_data_aceptado, puntaje)
       VALUES (?, ?, ?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE nombre_contacto=?, apellido_contacto=?, grado_interes_id=?, puntaje=?, actualizado_en=NOW()`,
      [cleanTel, nombre, apellido, gradoId || null, puntaje, nombre, apellido, gradoId || null, puntaje]
    );

    await pool.query(
      `INSERT INTO leads (telefono, nombre, apellido, programa_interes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre=?, apellido=?, programa_interes=?, fecha_registro=NOW()`,
      [cleanTel, nombre, apellido, gradoTexto || 'Grado no especificado', nombre, apellido, gradoTexto || 'Grado no especificado']
    );

    console.log(`✅ Lead registrado exitosamente en MySQL con scoring ${puntaje} para ${nombreCompleto} (${cleanTel})`);
  } catch (error) {
    console.error('❌ Error al guardar lead en MySQL:', error.message);
  }
}

/**
 * Registrar log en la tabla `mensajes_log` de MySQL
 */
async function registrarLog(telefono, direccion, contenido) {
  try {
    await pool.query(
      'INSERT INTO mensajes_log (telefono, direccion, contenido) VALUES (?, ?, ?)',
      [telefono, direccion, contenido]
    );
  } catch (error) {}
}

/**
 * Resetear conversación limpia desde 0
 */
async function resetearConversacionLimpia(telefono) {
  estadosEnMemoria.delete(telefono);
  try {
    await pool.query('DELETE FROM conversaciones WHERE telefono = ?', [telefono]);
  } catch (e) {}

  const bienvenidaBD = await obtenerTextoBot(
    'bienvenida',
    '👋 ¡Hola! Bienvenido al Colegio Virtual Educando para la Vida 🎓✨. Somos una institución educativa 100% autorizada 📚.\n\nPara iniciar su registro, ¿cuál es su *Nombre Completo* (Nombres y Apellidos)? ✍️'
  );

  await enviarTexto(telefono, bienvenidaBD);
  await registrarLog(telefono, 'saliente', bienvenidaBD);
  await actualizarConversacion(telefono, {
    paso_actual: 'nombre',
    nombre_temp: null,
    telefono_temp: telefono,
    programa_temp: null
  });
}

/**
 * Enviar tarjeta de recuento general final
 */
async function enviarRecuentoGeneralFinal(telefono, estado) {
  const nombreComp = estado.nombre_temp || 'No especificado';
  const progComp = estado.programa_temp || 'No especificado';

  const recuento = `📋 *Recuento General de su Registro* ✨\n\n` +
    `Por favor verifique si la información registrada es correcta:\n\n` +
    `👤 *Nombre y Apellidos:* ${nombreComp}\n` +
    `📲 *Teléfono de Contacto:* ${telefono}\n` +
    `🎓 *Grado Educativo:* ${progComp}\n\n` +
    `Responda enviando el número de su opción:\n` +
    `1️⃣ *1.* Sí, confirmar e inscribirme ✅\n` +
    `2️⃣ *2.* No, reiniciar para corregir datos 🔄`;

  await enviarTexto(telefono, recuento);
  await registrarLog(telefono, 'saliente', recuento);
}

/**
 * Procesar mensaje NLU con maquina de estados estricta y lectura directa de MySQL
 */
async function procesarMensaje(telefono, mensajeTexto) {
  const textoLimpio = mensajeTexto ? mensajeTexto.trim() : '';
  const textoNorm = normalizarTexto(textoLimpio);
  console.log(` PROCESANDO MENSAJE NLU para ${telefono}: "${textoLimpio}" (norm: "${textoNorm}")`);
  await registrarLog(telefono, 'entrante', textoLimpio);

  // Comando de reinicio limpio
  if (textoNorm === 'reiniciar' || textoNorm === 'cancelar' || textoNorm === 'inicio' || textoNorm === 'reset' || textoNorm === 'limpiar') {
    await resetearConversacionLimpia(telefono);
    return;
  }

  const estado = await obtenerEstadoConversacion(telefono);

  switch (estado.paso_actual) {
    case 'inicio': {
      await resetearConversacionLimpia(telefono);
      break;
    }

    case 'nombre': {
      if (!textoLimpio) {
        const msg = '✍️ Por favor indique su *Nombre Completo* (Nombres y Apellidos) para continuar su solicitud:';
        await enviarTexto(telefono, msg);
        await registrarLog(telefono, 'saliente', msg);
        return;
      }

      // Si el texto es una pregunta FAQ antes de ingresar nombre
      const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
      if (respuestaFaq) {
        const msgFaq = `${respuestaFaq}\n\n✍️ Para continuar con su registro, por favor indique su *Nombre Completo* (Nombres y Apellidos):`;
        await enviarTexto(telefono, msgFaq);
        await registrarLog(telefono, 'saliente', msgFaq);
        return;
      }

      // Guardar nombre ingresado y pasar de inmediato a la oferta de Grados de MySQL
      await actualizarConversacion(telefono, {
        nombre_temp: textoLimpio,
        paso_actual: 'programa'
      });

      await enviarListaGrados(telefono);
      break;
    }

    case 'programa': {
      const gradosDisponibles = await obtenerGradosDinamicos();
      let gradoSeleccionadoText = null;

      // 1. Intentar mapear por número (1, 2, 3, 4, 5)
      const numParsed = parseInt(textoLimpio);
      if (!isNaN(numParsed) && numParsed >= 1 && numParsed <= gradosDisponibles.length) {
        gradoSeleccionadoText = gradosDisponibles[numParsed - 1].nombre;
      }

      // 2. Intentar mapear por nombre textual exacto si no fue un número
      if (!gradoSeleccionadoText) {
        const porNombre = gradosDisponibles.find(
          (g) => normalizarTexto(g.nombre).includes(textoNorm) || textoNorm.includes(normalizarTexto(g.nombre))
        );
        if (porNombre) {
          gradoSeleccionadoText = porNombre.nombre;
        }
      }

      // 3. Si el usuario ingresó un grado válido (por número o nombre)
      if (gradoSeleccionadoText) {
        const nuevoEstado = {
          ...estado,
          programa_temp: gradoSeleccionadoText,
          paso_actual: 'confirmacion_final',
        };

        await actualizarConversacion(telefono, {
          programa_temp: gradoSeleccionadoText,
          paso_actual: 'confirmacion_final',
        });

        await enviarRecuentoGeneralFinal(telefono, nuevoEstado);
        return;
      }

      // 4. Si el mensaje es una pregunta de FAQ en lugar de un número de grado
      const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
      if (respuestaFaq) {
        await enviarTexto(telefono, respuestaFaq);
        await registrarLog(telefono, 'saliente', respuestaFaq);
        await enviarListaGrados(telefono);
        return;
      }

      // 5. Si la opción no es válida ni numéricamente ni por FAQ
      const msgError = '⚠️ La opción ingresada no es válida.\n\nPor favor responda únicamente con el *número* del grado educativo de su interés (Ejemplo: 2):';
      await enviarTexto(telefono, msgError);
      await registrarLog(telefono, 'saliente', msgError);
      await enviarListaGrados(telefono);
      break;
    }

    case 'confirmacion_final': {
      if (textoNorm === '1' || textoNorm === 'si' || textoNorm === 'confirmar' || textoNorm === 'ok' || textoNorm === 'inscribirme' || textoNorm === '1.') {
        const nombreFinal = estado.nombre_temp || 'Interesado';
        const gradoFinal = estado.programa_temp || 'Sin grado';

        const gradosDisponibles = await obtenerGradosDinamicos();
        const gradoEncontrado = gradosDisponibles.find((g) => g.nombre.toLowerCase() === gradoFinal.toLowerCase());
        const gradoId = gradoEncontrado ? gradoEncontrado.id : null;

        // 1. Marcar conversación como finalizada
        await actualizarConversacion(telefono, { paso_actual: 'finalizado' });

        // 2. Guardar Lead en MySQL (`leads_fase2` y `leads`)
        try {
          await guardarLead(telefono, nombreFinal, gradoId, gradoFinal);
        } catch (e) {
          console.error('Error guardando lead:', e.message);
        }

        // 3. Enviar confirmación oficial desde MySQL
        const confirmacionBase = await obtenerTextoBot(
          'despedida',
          `🎉 ¡Muchas gracias, ${nombreFinal}! ✨ Hemos registrado exitosamente su inscripción para el programa: *${gradoFinal}* 🎓. Un asesor académico de admisiones se comunicará con usted a la brevedad 📲.`
        );

        const confirmacionFinal = `${confirmacionBase}\n\n(Escriba *REINICIAR* en cualquier momento si desea realizar otra solicitud) 🌟.`;
        await enviarTexto(telefono, confirmacionFinal);
        await registrarLog(telefono, 'saliente', confirmacionFinal);
      } else if (textoNorm === '2' || textoNorm === 'no' || textoNorm === 'reiniciar' || textoNorm === '2.') {
        await resetearConversacionLimpia(telefono);
      } else {
        const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
        if (respuestaFaq) {
          await enviarTexto(telefono, respuestaFaq);
          await registrarLog(telefono, 'saliente', respuestaFaq);
        }
        await enviarRecuentoGeneralFinal(telefono, estado);
      }
      break;
    }

    case 'finalizado': {
      const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
      if (respuestaFaq) {
        await enviarTexto(telefono, respuestaFaq);
        await registrarLog(telefono, 'saliente', respuestaFaq);
      } else {
        const msgFin = `🎓 Gracias por comunicarse con el Colegio Virtual Educando para la Vida. Su solicitud ya fue registrada con éxito 🌟.\n\nEscriba *REINICIAR* si desea realizar una nueva solicitud.`;
        await enviarTexto(telefono, msgFin);
        await registrarLog(telefono, 'saliente', msgFin);
      }
      break;
    }

    default: {
      await resetearConversacionLimpia(telefono);
    }
  }
}

module.exports = {
  procesarMensaje,
  resetearConversacionLimpia
};
