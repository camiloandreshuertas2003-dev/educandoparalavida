const pool = require('../config/db');
const { enviarMensajeWWeb } = require('./whatsappWebService');

// Memoria de respaldo para sincronizar estados si MySQL se reconecta
const estadosEnMemoria = new Map();

/**
 * Normalizar texto para tolerar tildes, mayúsculas, errores ortográficos y caracteres especiales
 */
function normalizarTexto(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, '')
    .replace(/presio|precio|presyo|costo|costos|kual|cual|cuanto|kwanto|cuanto vale|valor|mensualidad|pago|tarifas/g, 'precio')
    .replace(/vibo|vivo|bibo|clas|clase|clases|en vivo|horario|horarios|jornada|tiempo/g, 'vivo')
    .replace(/titulo|titulos|oficial|valido|men|icfes|secretaria|resolucion|diploma|graduado/g, 'titulo')
    .replace(/requisit|requisito|requisitos|papeles|documento|documentos|matricula|inscripcion/g, 'requisito')
    .replace(/donde|ubicacion|direccion|sede|sedes|ciudad|pais/g, 'ubicacion')
    .trim();
}

/**
 * Helper para enviar mensajes de texto a través del motor de WhatsApp activo
 */
async function enviarTexto(sessionId, mensaje) {
  try {
    await enviarMensajeWWeb(sessionId, mensaje);
  } catch (err) {
    console.error(`❌ Error enviando mensaje de WhatsApp a ${sessionId}:`, err.message);
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
 * Buscar respuestas dinámicas NLU en la tabla `base_conocimiento` (FAQs) de MySQL
 * Tolerante a variaciones de palabras sin necesidad de signos de interrogación (?)
 */
async function buscarEnBaseConocimiento(mensajeTexto) {
  if (!mensajeTexto) return null;
  const textoNorm = normalizarTexto(mensajeTexto);

  try {
    const [faqs] = await pool.query('SELECT pregunta_frecuente, respuesta_aprobada FROM base_conocimiento WHERE activo = TRUE');
    if (faqs && faqs.length > 0) {
      let mejorCoincidencia = null;
      let maxScore = 0;

      for (const faq of faqs) {
        const pregNorm = normalizarTexto(faq.pregunta_frecuente);
        const palabrasPregunta = pregNorm.split(/\s+/).filter(w => w.length > 2);

        let score = 0;
        palabrasPregunta.forEach(palabra => {
          if (textoNorm.includes(palabra)) {
            score += 2;
          }
        });

        // Coincidencias temáticas por sinonimia
        if ((textoNorm.includes('precio') || textoNorm.includes('costo') || textoNorm.includes('cuanto') || textoNorm.includes('pago') || textoNorm.includes('valor')) && 
            (pregNorm.includes('precio') || pregNorm.includes('costo') || pregNorm.includes('pension'))) {
          score += 5;
        }

        if ((textoNorm.includes('vivo') || textoNorm.includes('clase') || textoNorm.includes('horario') || textoNorm.includes('jornada')) && 
            (pregNorm.includes('vivo') || pregNorm.includes('clase') || pregNorm.includes('horario') || pregNorm.includes('metodologia'))) {
          score += 5;
        }

        if ((textoNorm.includes('titulo') || textoNorm.includes('oficial') || textoNorm.includes('valido') || textoNorm.includes('icfes') || textoNorm.includes('men') || textoNorm.includes('diploma')) && 
            (pregNorm.includes('titulo') || pregNorm.includes('oficial') || pregNorm.includes('valido') || pregNorm.includes('icfes'))) {
          score += 5;
        }

        if ((textoNorm.includes('requisito') || textoNorm.includes('documento') || textoNorm.includes('papel') || textoNorm.includes('matricula')) && 
            (pregNorm.includes('requisito') || pregNorm.includes('documento') || pregNorm.includes('matricula'))) {
          score += 5;
        }

        if ((textoNorm.includes('ubicacion') || textoNorm.includes('donde') || textoNorm.includes('sede') || textoNorm.includes('ciudad')) && 
            (pregNorm.includes('ubicacion') || pregNorm.includes('sede') || pregNorm.includes('donde'))) {
          score += 5;
        }

        if (score > maxScore && score >= 2) {
          maxScore = score;
          mejorCoincidencia = faq.respuesta_aprobada;
        }
      }

      if (mejorCoincidencia) {
        return mejorCoincidencia;
      }
    }
  } catch (err) {
    console.warn('⚠️ Nota consultando Base de Conocimiento en MySQL:', err.message);
  }

  // Respuestas predeterminadas institucionales si la BD se encuentra en inicialización
  if (textoNorm.includes('precio')) {
    return '💡 En el Colegio Virtual Educando para la Vida 🎓 los costos son muy accesibles. Ofrecemos mensualidades económicas con facilidades de pago 💸. Al registrar sus datos, le enviaremos la tarifa exacta para su grado 📚.';
  }
  if (textoNorm.includes('vivo')) {
    return '💻 Ofrecemos un modelo flexible 100% virtual con plataforma disponible 24/7, clases en vivo interactivas 🎥 y tutorías personalizadas para aprender a su propio ritmo ✨.';
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
async function enviarListaGrados(sessionId) {
  const grados = await obtenerGradosDinamicos();
  const tituloGrados = await obtenerTextoBot(
    'seleccion_grado',
    '🎓 Seleccione el *Grado Educativo* de su interés enviando el número correspondiente 👇:'
  );

  let msg = `${tituloGrados}\n\n`;
  grados.forEach((g, idx) => {
    msg += `${idx + 1}. ${g.nombre}\n`;
  });
  msg += '\n👉 *Responda únicamente con el número de su opción (Ejemplo: 2)*';

  await enviarTexto(sessionId, msg);
  await registrarLog(sessionId, 'saliente', msg);
}

/**
 * Obtener estado de la conversación indexado por sessionId
 */
async function obtenerEstadoConversacion(sessionId) {
  try {
    const [rows] = await pool.query('SELECT * FROM conversaciones WHERE telefono = ?', [sessionId]);
    if (rows && rows.length > 0) {
      const estadoBD = rows[0];
      estadosEnMemoria.set(sessionId, estadoBD);
      return estadoBD;
    }
  } catch (error) {}

  if (estadosEnMemoria.has(sessionId)) {
    return estadosEnMemoria.get(sessionId);
  }

  const nuevoEstado = {
    telefono: sessionId,
    paso_actual: 'inicio',
    nombre_temp: null,
    apellido_temp: null,
    telefono_temp: null,
    programa_temp: null,
  };
  estadosEnMemoria.set(sessionId, nuevoEstado);
  return nuevoEstado;
}

/**
 * Actualizar atómicamente la conversación en MySQL y Memoria
 */
async function actualizarConversacion(sessionId, nuevosCampos) {
  const actual = estadosEnMemoria.get(sessionId) || { telefono: sessionId, paso_actual: 'inicio' };
  const actualizado = { ...actual, ...nuevosCampos };
  estadosEnMemoria.set(sessionId, actualizado);

  try {
    const fields = Object.keys(nuevosCampos);
    if (fields.length === 0) return actualizado;

    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const updateValues = fields.map((f) => nuevosCampos[f]);

    const insertFields = ['telefono', ...fields].join(', ');
    const placeholders = ['?', ...fields.map(() => '?')].join(', ');
    const insertValues = [sessionId, ...updateValues];

    const sql = `
      INSERT INTO conversaciones (${insertFields})
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${setClause}, actualizado_en = NOW()
    `;

    await pool.query(sql, [...insertValues, ...updateValues]);
  } catch (error) {
    console.error('❌ Error actualizando conversacion en DB:', error.message);
  }
  return actualizado;
}

/**
 * Guardar Lead final en las tablas `leads_fase2` y `leads` de MySQL usando el teléfono manual ingresado
 */
async function guardarLead(telefonoManual, nombreCompleto, gradoId, gradoTexto) {
  try {
    let puntaje = 30;
    if (nombreCompleto) puntaje += 20;

    const partes = (nombreCompleto || '').trim().split(/\s+/);
    const nombre = partes[0] || 'Interesado';
    const apellido = partes.slice(1).join(' ') || '';
    const cleanTel = (telefonoManual || 'Sin número').toString().trim();

    console.log(`💾 INSERTANDO LEAD EN MYSQL -> Teléfono: ${cleanTel}, Nombre: ${nombre} ${apellido}, Grado: ${gradoTexto}`);

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
async function registrarLog(sessionId, direccion, contenido) {
  try {
    await pool.query(
      'INSERT INTO mensajes_log (telefono, direccion, contenido) VALUES (?, ?, ?)',
      [sessionId, direccion, contenido]
    );
  } catch (error) {}
}

/**
 * Resetear conversación limpia desde 0 usando mensaje administrable en MySQL
 */
async function resetearConversacionLimpia(sessionId) {
  estadosEnMemoria.delete(sessionId);
  try {
    await pool.query('DELETE FROM conversaciones WHERE telefono = ?', [sessionId]);
  } catch (e) {}

  const bienvenidaBD = await obtenerTextoBot(
    'bienvenida',
    '👋 ¡Hola! Bienvenido al Colegio Virtual Educando para la Vida 🎓✨. Somos una institución educativa 100% autorizada por la Secretaría de Educación 📚.\n\nPara iniciar su registro, ¿cuál es su *Nombre Completo* (Nombres y Apellidos)? ✍️'
  );

  await enviarTexto(sessionId, bienvenidaBD);
  await registrarLog(sessionId, 'saliente', bienvenidaBD);
  await actualizarConversacion(sessionId, {
    paso_actual: 'nombre',
    nombre_temp: null,
    telefono_temp: null,
    programa_temp: null
  });
}

/**
 * Procesar mensaje NLU directo utilizando únicamente los mensajes de la tabla `bot_mensajes` y `base_conocimiento`
 */
async function procesarMensaje(sessionId, mensajeTexto) {
  const textoLimpio = mensajeTexto ? mensajeTexto.trim() : '';
  const textoNorm = normalizarTexto(textoLimpio);
  console.log(` PROCESANDO MENSAJE NLU para ${sessionId}: "${textoLimpio}" (norm: "${textoNorm}")`);
  await registrarLog(sessionId, 'entrante', textoLimpio);

  // Comando de reinicio limpio en cualquier momento
  if (textoNorm === 'reiniciar' || textoNorm === 'cancelar' || textoNorm === 'inicio' || textoNorm === 'reset' || textoNorm === 'limpiar') {
    await resetearConversacionLimpia(sessionId);
    return;
  }

  let estado = await obtenerEstadoConversacion(sessionId);

  switch (estado.paso_actual) {
    case 'inicio': {
      await resetearConversacionLimpia(sessionId);
      break;
    }

    case 'nombre': {
      if (!textoLimpio) {
        const msg = '✍️ Por favor indique su *Nombre Completo* (Nombres y Apellidos) para continuar su solicitud:';
        await enviarTexto(sessionId, msg);
        await registrarLog(sessionId, 'saliente', msg);
        return;
      }

      // Responder FAQ desde MySQL si el cliente hace una pregunta antes de dar su nombre
      const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
      if (respuestaFaq) {
        const msgFaq = `${respuestaFaq}\n\n✍️ Para continuar con su registro, por favor indique su *Nombre Completo* (Nombres y Apellidos):`;
        await enviarTexto(sessionId, msgFaq);
        await registrarLog(sessionId, 'saliente', msgFaq);
        return;
      }

      // Guardar Nombre y solicitar número telefónico usando el paso 2 administrable en MySQL
      estado = await actualizarConversacion(sessionId, {
        nombre_temp: textoLimpio,
        paso_actual: 'telefono'
      });

      const msgTel = await obtenerTextoBot(
        'solicitar_telefono',
        '📱 Por favor escriba su *Número de Teléfono / Celular de Contacto* para enviarle la información oficial (Ejemplo: 3218423914): ✍️'
      );
      await enviarTexto(sessionId, msgTel);
      await registrarLog(sessionId, 'saliente', msgTel);
      break;
    }

    case 'telefono': {
      if (!textoLimpio) {
        const msg = '📱 Por favor ingrese su *Número de Teléfono / Celular de Contacto* (Ejemplo: 3218423914):';
        await enviarTexto(sessionId, msg);
        await registrarLog(sessionId, 'saliente', msg);
        return;
      }

      // Responder FAQ desde MySQL si el cliente hace una pregunta antes de dar su número
      const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
      if (respuestaFaq) {
        const msgFaq = `${respuestaFaq}\n\n📱 Para continuar, por favor escriba su *Número de Teléfono / Celular de Contacto* (Ejemplo: 3218423914):`;
        await enviarTexto(sessionId, msgFaq);
        await registrarLog(sessionId, 'saliente', msgFaq);
        return;
      }

      // Guardar el número ingresado manualmente y enviar el menú de Grados de MySQL
      estado = await actualizarConversacion(sessionId, {
        telefono_temp: textoLimpio,
        paso_actual: 'programa'
      });

      await enviarListaGrados(sessionId);
      break;
    }

    case 'programa': {
      const gradosDisponibles = await obtenerGradosDinamicos();
      let gradoSeleccionadoText = null;

      // 1. Coincidencia por número (1, 2, 3, 4, 5)
      const numParsed = parseInt(textoLimpio);
      if (!isNaN(numParsed) && numParsed >= 1 && numParsed <= gradosDisponibles.length) {
        gradoSeleccionadoText = gradosDisponibles[numParsed - 1].nombre;
      }

      // 2. Coincidencia parcial por nombre
      if (!gradoSeleccionadoText) {
        const porNombre = gradosDisponibles.find(
          (g) => normalizarTexto(g.nombre).includes(textoNorm) || textoNorm.includes(normalizarTexto(g.nombre))
        );
        if (porNombre) {
          gradoSeleccionadoText = porNombre.nombre;
        }
      }

      // 3. SI EL USUARIO SELECCIONA UN GRADO VÁLIDO -> GUARDADO DIRECTO AUTOMÁTICO EN MYSQL Y CRM
      if (gradoSeleccionadoText) {
        const nombreFinal = estado.nombre_temp || 'Interesado';
        const telManualFinal = estado.telefono_temp || sessionId.replace(/[^\d]/g, '') || 'Sin número';
        const gradoFinal = gradoSeleccionadoText;

        const gradoEncontrado = gradosDisponibles.find((g) => g.nombre.toLowerCase() === gradoFinal.toLowerCase());
        const gradoId = gradoEncontrado ? gradoEncontrado.id : null;

        // A. Marcar conversación como finalizada en MySQL y Memoria
        await actualizarConversacion(sessionId, {
          programa_temp: gradoSeleccionadoText,
          paso_actual: 'finalizado'
        });

        // B. Guardar de inmediato el Lead en MySQL (`leads_fase2` y `leads`)
        try {
          await guardarLead(telManualFinal, nombreFinal, gradoId, gradoFinal);
        } catch (e) {
          console.error('Error guardando lead:', e.message);
        }

        // C. Enviar mensaje final de agradecimiento e inscripción oficial administrable desde MySQL
        const confirmacionBase = await obtenerTextoBot(
          'despedida',
          `🎉 ¡Muchas gracias, ${nombreFinal}! ✨ Hemos registrado exitosamente su inscripción para el programa: *${gradoFinal}* 🎓. Un asesor académico de admisiones se comunicará con usted al teléfono *${telManualFinal}* 📲.`
        );

        const confirmacionFinal = `${confirmacionBase}\n\n(Escriba *REINICIAR* en cualquier momento si desea realizar otra solicitud) 🌟.`;
        await enviarTexto(sessionId, confirmacionFinal);
        await registrarLog(sessionId, 'saliente', confirmacionFinal);
        return;
      }

      // 4. Responder FAQ si el cliente hace una pregunta sobre costos, validez, etc.
      const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
      if (respuestaFaq) {
        await enviarTexto(sessionId, respuestaFaq);
        await registrarLog(sessionId, 'saliente', respuestaFaq);
        await enviarListaGrados(sessionId);
        return;
      }

      // 5. Opción no válida
      const msgError = '⚠️ Opción no válida. Por favor responda únicamente con el número (1 al 5) del grado educativo de su interés:';
      await enviarTexto(sessionId, msgError);
      await registrarLog(sessionId, 'saliente', msgError);
      await enviarListaGrados(sessionId);
      break;
    }

    case 'finalizado': {
      // Si el cliente ya terminó su registro pero hace cualquier pregunta de FAQ
      const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
      if (respuestaFaq) {
        await enviarTexto(sessionId, respuestaFaq);
        await registrarLog(sessionId, 'saliente', respuestaFaq);
      } else {
        const msgFin = `🎓 Gracias por comunicarse con el Colegio Virtual Educando para la Vida. Su solicitud ya fue registrada con éxito 🌟.\n\nEscriba *REINICIAR* si desea realizar una nueva solicitud.`;
        await enviarTexto(sessionId, msgFin);
        await registrarLog(sessionId, 'saliente', msgFin);
      }
      break;
    }

    default: {
      await resetearConversacionLimpia(sessionId);
    }
  }
}

module.exports = {
  procesarMensaje,
  resetearConversacionLimpia
};
