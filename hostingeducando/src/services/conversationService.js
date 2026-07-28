const pool = require('../config/db');
const { enviarMensajeTexto, enviarMensajeLista } = require('./whatsappService');

// Fallback en memoria por si la base de datos remota tiene alta latencia
const estadosEnMemoria = new Map();

/**
 * Normalizar texto para tolerar mala ortografía, tildes y errores fonéticos comunes
 */
function normalizarTexto(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes y acentos
    .replace(/[^\w\s]/gi, '')       // Eliminar signos de puntuación
    .replace(/\bk\b/g, 'que')       // reemplazar 'k' sola por 'que'
    .replace(/presio|precio|presyo|costo|costos|kual|cual|cuanto|kwanto/g, 'precio')
    .replace(/vibo|vivo|bibo|clas|clase|clases|en vivo/g, 'vivo')
    .replace(/titulo|titulos|oficial|valido|men|icfes/g, 'titulo')
    .replace(/requisit|requisito|requisitos|papeles|documento|documentos/g, 'requisito')
    .trim();
}

/**
 * Buscar respuestas en la Base de Conocimiento (FAQs) tolerando mala ortografía
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
    console.warn('⚠️ Nota consultando Base de Conocimiento:', err.message);
  }

  // Respuestas predeterminadas institucionales con emojis amables
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
 * Obtener lista dinámica de grados activos desde MySQL
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
 * Enviar lista de oferta académica
 */
async function enviarListaGrados(telefono) {
  const gradosDisponibles = await obtenerGradosDinamicos();
  const secciones = [
    {
      title: 'Grados Disponibles 📚',
      rows: gradosDisponibles.map((g) => ({
        id: `g_${g.id}`,
        title: g.nombre,
      })),
    },
  ];

  const mensajeHeader = 'Oferta Académica 2026 🎓';
  const mensajeBody = 'Seleccione en cuál grado o nivel educativo se encuentra interesado/a 👇:';

  try {
    await enviarMensajeLista(telefono, mensajeBody, mensajeHeader, secciones);
  } catch (err) {
    let fallbackMsg = `${mensajeBody}\n\n`;
    gradosDisponibles.forEach((g, idx) => {
      fallbackMsg += `${idx + 1}. ${g.nombre}\n`;
    });
    await enviarMensajeTexto(telefono, fallbackMsg);
  }
  registrarLog(telefono, 'saliente', mensajeBody).catch(() => {});
}

/**
 * Obtener estado de la conversación
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
 * Actualizar atómicamente el estado de la conversación
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
 * Guardar Lead final con scoring
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
    console.error(' Error al guardar lead en MySQL:', error.message);
  }
}

/**
 * Guardar log del mensaje
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
 * Resetear limpia de estado para pruebas
 */
async function resetearConversacionLimpia(telefono) {
  estadosEnMemoria.delete(telefono);
  try {
    await pool.query('DELETE FROM conversaciones WHERE telefono = ?', [telefono]);
  } catch (e) {}

  const bienvenida = '👋 ¡Hola! Bienvenido al Colegio Virtual Educando para la Vida 🎓✨. Somos una institución educativa 100% autorizada 📚.\n\nPara iniciar su registro, ¿cuál es su *Nombre Completo* (Nombres y Apellidos)? ✍️';
  await enviarMensajeTexto(telefono, bienvenida);
  await registrarLog(telefono, 'saliente', bienvenida);
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
    `Por favor confirme si la información final es correcta para completar su inscripción:\n\n` +
    `👤 *Nombre y Apellidos:* ${nombreComp}\n` +
    `📲 *Teléfono de Contacto:* ${telefono}\n` +
    `🎓 *Grado Educativo:* ${progComp}\n\n` +
    `Responda con un número:\n` +
    `1️⃣ *1.* Sí, confirmar e inscribirme ✅\n` +
    `2️⃣ *2.* No, reiniciar todo el registro 🔄`;

  await enviarMensajeTexto(telefono, recuento);
  await registrarLog(telefono, 'saliente', recuento);
}

/**
 * Procesar mensaje entrante con confirmación paso a paso
 */
async function procesarMensaje(telefono, mensajeTexto) {
  const textoLimpio = mensajeTexto ? mensajeTexto.trim() : '';
  const textoNorm = normalizarTexto(textoLimpio);
  console.log(` PROCESANDO MENSAJE NLU para ${telefono}: "${textoLimpio}" (norm: "${textoNorm}")`);
  registrarLog(telefono, 'entrante', textoLimpio).catch(() => {});

  // Comando de reinicio limpio
  if (textoNorm === 'reiniciar' || textoNorm === 'cancelar' || textoNorm === 'inicio' || textoNorm === 'reset' || textoNorm === 'limpiar') {
    await resetearConversacionLimpia(telefono);
    return;
  }

  // Comprobar FAQ libre si no está en pasos de confirmación crítica
  const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
  const estado = await obtenerEstadoConversacion(telefono);

  if (respuestaFaq && estado.paso_actual !== 'confirmar_nombre' && estado.paso_actual !== 'confirmar_programa' && estado.paso_actual !== 'confirmacion_final' && estado.paso_actual !== 'finalizado') {
    let msgPregunta = `${respuestaFaq}\n\n`;
    if (estado.paso_actual === 'nombre') msgPregunta += '✍️ Indique su *Nombre Completo* (Nombres y Apellidos) para continuar su registro:';
    else if (estado.paso_actual === 'programa') msgPregunta += '🎓 Indique el grado educativo de su interés:';

    await enviarMensajeTexto(telefono, msgPregunta);
    registrarLog(telefono, 'saliente', msgPregunta).catch(() => {});
    return;
  }

  switch (estado.paso_actual) {
    case 'inicio': {
      await resetearConversacionLimpia(telefono);
      break;
    }

    case 'nombre': {
      if (!textoLimpio) {
        const msg = '✍️ Por favor indique su *Nombre Completo* (Nombres y Apellidos) para continuar:';
        await enviarMensajeTexto(telefono, msg);
        registrarLog(telefono, 'saliente', msg).catch(() => {});
        return;
      }

      await actualizarConversacion(telefono, {
        nombre_temp: textoLimpio,
        paso_actual: 'confirmar_nombre',
      });

      // Confirmar inmediatamente el nombre ingresado
      const msgConfirmNombre = `👤 Confirme si su *Nombre Completo* registrado es correcto:\n👉 *${textoLimpio}*\n\nResponda con un número:\n1️⃣ *1.* Sí, es correcto 👍\n2️⃣ *2.* No, deseo corregir mi nombre ✏️`;
      await enviarMensajeTexto(telefono, msgConfirmNombre);
      registrarLog(telefono, 'saliente', msgConfirmNombre).catch(() => {});
      break;
    }

    case 'confirmar_nombre': {
      if (textoNorm === '1' || textoNorm === 'si' || textoNorm === 'correcto' || textoNorm === 'ok') {
        // Nombre verificado correctamente, pasar a la oferta académica (Grados)
        await actualizarConversacion(telefono, { paso_actual: 'programa' });
        await enviarListaGrados(telefono);
      } else if (textoNorm === '2' || textoNorm === 'no' || textoNorm === 'corregir') {
        // Corregir nombre
        await actualizarConversacion(telefono, { paso_actual: 'nombre' });
        const msg = '✍️ Por favor escriba nuevamente su *Nombre Completo* (Nombres y Apellidos):';
        await enviarMensajeTexto(telefono, msg);
        registrarLog(telefono, 'saliente', msg).catch(() => {});
      } else {
        // Opción no válida
        const msgRetry = `👤 Confirme si su nombre es correcto (*${estado.nombre_temp}*):\n\n1️⃣ *1.* Sí, es correcto 👍\n2️⃣ *2.* No, corregir mi nombre ✏️`;
        await enviarMensajeTexto(telefono, msgRetry);
      }
      break;
    }

    case 'programa': {
      const gradosDisponibles = await obtenerGradosDinamicos();
      let gradoSeleccionadoText = textoLimpio;

      const gradoEncontrado = gradosDisponibles.find(
        (g) => g.nombre.toLowerCase() === textoLimpio.toLowerCase() || `g_${g.id}` === textoLimpio
      );

      if (gradoEncontrado) {
        gradoSeleccionadoText = gradoEncontrado.nombre;
      } else {
        const idxNum = parseInt(textoLimpio) - 1;
        if (!isNaN(idxNum) && gradosDisponibles[idxNum]) {
          gradoSeleccionadoText = gradosDisponibles[idxNum].nombre;
        }
      }

      await actualizarConversacion(telefono, {
        programa_temp: gradoSeleccionadoText,
        paso_actual: 'confirmar_programa',
      });

      // Confirmar inmediatamente el grado seleccionado
      const msgConfirmGrado = `🎓 Confirme si el *Grado Educativo* seleccionado es correcto:\n👉 *${gradoSeleccionadoText}*\n\nResponda con un número:\n1️⃣ *1.* Sí, es correcto 👍\n2️⃣ *2.* No, deseo cambiar el grado 📚`;
      await enviarMensajeTexto(telefono, msgConfirmGrado);
      registrarLog(telefono, 'saliente', msgConfirmGrado).catch(() => {});
      break;
    }

    case 'confirmar_programa': {
      if (textoNorm === '1' || textoNorm === 'si' || textoNorm === 'correcto' || textoNorm === 'ok') {
        // Grado verificado correctamente, pasar al Recuento General Final
        const estadoActualizado = { ...estado, paso_actual: 'confirmacion_final' };
        await actualizarConversacion(telefono, { paso_actual: 'confirmacion_final' });
        await enviarRecuentoGeneralFinal(telefono, estadoActualizado);
      } else if (textoNorm === '2' || textoNorm === 'no' || textoNorm === 'cambiar') {
        // Cambiar grado
        await actualizarConversacion(telefono, { paso_actual: 'programa' });
        await enviarListaGrados(telefono);
      } else {
        const msgRetry = `🎓 Confirme si el grado es correcto (*${estado.programa_temp}*):\n\n1️⃣ *1.* Sí, es correcto 👍\n2️⃣ *2.* No, cambiar grado 📚`;
        await enviarMensajeTexto(telefono, msgRetry);
      }
      break;
    }

    case 'confirmacion_final': {
      if (textoNorm === '1' || textoNorm === 'si' || textoNorm === 'confirmar' || textoNorm === 'ok' || textoNorm === 'inscribirme') {
        const nombreFinal = estado.nombre_temp || 'Interesado';
        const gradoFinal = estado.programa_temp || 'Sin grado';

        const gradosDisponibles = await obtenerGradosDinamicos();
        const gradoEncontrado = gradosDisponibles.find((g) => g.nombre.toLowerCase() === gradoFinal.toLowerCase());
        const gradoId = gradoEncontrado ? gradoEncontrado.id : null;

        // 1. Marcar conversación como finalizada
        await actualizarConversacion(telefono, { paso_actual: 'finalizado' });

        // 2. Guardar Lead en MySQL
        try {
          await guardarLead(telefono, nombreFinal, gradoId, gradoFinal);
        } catch (e) {
          console.error('Error guardando lead:', e.message);
        }

        // 3. Enviar mensaje de bienvenida e inscripción oficial
        const confirmacion = `🎉 ¡Muchas gracias, ${nombreFinal}! ✨ Hemos registrado exitosamente su inscripción para el programa: *${gradoFinal}* 🎓. Un asesor académico de admisiones se comunicará con usted a la brevedad 📲.\n\n(Escriba *REINICIAR* en cualquier momento si desea realizar otra consulta) 🌟.`;
        await enviarMensajeTexto(telefono, confirmacion);
        registrarLog(telefono, 'saliente', confirmacion).catch(() => {});
      } else if (textoNorm === '2' || textoNorm === 'no' || textoNorm === 'reiniciar') {
        await resetearConversacionLimpia(telefono);
      } else {
        await enviarRecuentoGeneralFinal(telefono, estado);
      }
      break;
    }

    case 'finalizado': {
      if (respuestaFaq) {
        await enviarMensajeTexto(telefono, respuestaFaq);
        registrarLog(telefono, 'saliente', respuestaFaq).catch(() => {});
      } else {
        const msgFin = `🎓 Gracias por comunicarse con el Colegio Virtual Educando para la Vida. Su solicitud ya fue registrada con éxito 🌟.\n\nEscriba *REINICIAR* si desea realizar una nueva solicitud.`;
        await enviarMensajeTexto(telefono, msgFin);
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
