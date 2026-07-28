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
 * Despachar menú interactivo de opciones cuando el mensaje no se entiende o se solicita ayuda
 */
async function enviarMenuOpcionesFaq(telefono) {
  const secciones = [
    {
      title: 'Consultas Frecuentes 💡',
      rows: [
        { id: 'faq_precios', title: 'Precios y Pensiones 💸' },
        { id: 'faq_clases', title: 'Clases y Metodología 💻' },
        { id: 'faq_titulo', title: 'Título Oficial MEN 📜' },
        { id: 'faq_requisitos', title: 'Requisitos de Matrícula 📋' },
        { id: 'faq_horarios', title: 'Horarios de Atención ⏰' },
      ],
    },
  ];

  const header = ' Menú de Ayuda 🎓';
  const body = 'Seleccione la opción de su interés o indique su nombre completo para continuar su registro:';

  try {
    await enviarMensajeLista(telefono, body, header, secciones);
  } catch (e) {
    const textFallback = `${body}\n\n1. Precios y Pensiones 💸\n2. Clases y Metodología 💻\n3. Título Oficial MEN 📜\n4. Requisitos de Matrícula 📋\n5. Horarios de Atención ⏰`;
    await enviarMensajeTexto(telefono, textFallback);
  }
}

/**
 * Obtener mensaje personalizado del bot desde la base de datos
 */
async function obtenerTextoBot(clave, textoPorDefecto) {
  try {
    const [rows] = await pool.query('SELECT contenido FROM bot_mensajes WHERE clave = ? AND activo = TRUE', [clave]);
    if (rows && rows.length > 0 && rows[0].contenido) {
      return rows[0].contenido;
    }
  } catch (err) {}
  return textoPorDefecto;
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
    telefono_temp: null,
    programa_temp: null,
  };
  estadosEnMemoria.set(telefono, nuevoEstado);
  return nuevoEstado;
}

/**
 * Actualizar atomicamente el estado de la conversación usando UPSERT
 */
async function actualizarConversacion(telefono, nuevosCampos) {
  const actual = estadosEnMemoria.get(telefono) || { telefono, paso_actual: 'inicio' };
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
 * Guardar el Lead final con puntuación de Lead Scoring
 */
async function guardarLead(telefono, nombreCompleto, telefonoContacto, gradoId, gradoTexto) {
  try {
    let puntaje = 30;
    if (nombreCompleto) puntaje += 20;

    const partes = (nombreCompleto || '').trim().split(/\s+/);
    const nombre = partes[0] || 'Interesado';
    const apellido = partes.slice(1).join(' ') || '';

    const cleanTel = (telefonoContacto || telefono || 'Sin número').toString().trim();

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
 * Enviar cuadro de confirmación ameno con emojis y números para elegir
 */
async function enviarMensajeConfirmacionDatos(telefono, estado) {
  const nombreComp = estado.nombre_temp || 'No especificado';
  const telCont = estado.telefono_temp || telefono;
  const progComp = estado.programa_temp || 'No especificado';

  const msgConfirmacion = `📋 *Verificación de Datos de Contacto* ✨\n\n` +
    `Por favor confirme si la información registrada es correcta:\n\n` +
    `👤 *1. Nombre y Apellidos:* ${nombreComp}\n` +
    `📲 *2. Teléfono de Contacto:* ${telCont}\n` +
    `🎓 *3. Grado Educativo:* ${progComp}\n\n` +
    `Responda con un número:\n` +
    `✅ *4.* Si los datos son *CORRECTOS* y desea confirmar.\n` +
    `✏️ *1.* Si desea corregir su Nombre y Apellidos.\n` +
    `📱 *2.* Si desea corregir su Teléfono.\n` +
    `📚 *3.* Si desea corregir su Grado.`;

  await enviarMensajeTexto(telefono, msgConfirmacion);
  await registrarLog(telefono, 'saliente', msgConfirmacion);
}

/**
 * Procesar mensaje entrante
 */
async function procesarMensaje(telefono, mensajeTexto) {
  const textoLimpio = mensajeTexto ? mensajeTexto.trim() : '';
  const textoNorm = normalizarTexto(textoLimpio);
  console.log(` PROCESANDO MENSAJE NLU para ${telefono}: "${textoLimpio}" (norm: "${textoNorm}")`);
  registrarLog(telefono, 'entrante', textoLimpio).catch(() => {});

  // Comando global para reiniciar conversación
  if (textoNorm === 'reiniciar' || textoNorm === 'cancelar' || textoNorm === 'inicio' || textoNorm === 'reset') {
    await actualizarConversacion(telefono, {
      paso_actual: 'inicio',
      nombre_temp: null,
      apellido_temp: null,
      telefono_temp: null,
      programa_temp: null,
    });
    
    const bienvenida = '👋 ¡Hola! Bienvenido al Colegio Virtual Educando para la Vida 🎓✨. Somos una institución educativa 100% autorizada 📚. Para brindarle información personalizada sobre matrículas, por favor indique su *Nombre Completo* (Nombres y Apellidos) ✍️:';
    await enviarMensajeTexto(telefono, bienvenida);
    registrarLog(telefono, 'saliente', bienvenida).catch(() => {});
    await actualizarConversacion(telefono, { paso_actual: 'nombre' });
    return;
  }

  // Solicitud explícita de menú o ayuda
  if (textoNorm === 'menu' || textoNorm === 'ayuda' || textoNorm === 'opciones') {
    await enviarMenuOpcionesFaq(telefono);
    return;
  }

  // Comprobar si el mensaje es una pregunta libre tolerando mala ortografía
  const respuestaFaq = await buscarEnBaseConocimiento(textoLimpio);
  const estado = await obtenerEstadoConversacion(telefono);

  if (respuestaFaq && estado.paso_actual !== 'inicio' && estado.paso_actual !== 'confirmacion' && estado.paso_actual !== 'finalizado') {
    let msgPregunta = `${respuestaFaq}\n\n`;
    if (estado.paso_actual === 'nombre') msgPregunta += '✍️ Para continuar con su registro, por favor indique su *Nombre Completo* (Nombres y Apellidos):';
    else if (estado.paso_actual === 'telefono') msgPregunta += '📲 Indique su número telefónico de contacto:';
    else if (estado.paso_actual === 'programa') msgPregunta += '🎓 Indique el grado educativo de su interés:';

    await enviarMensajeTexto(telefono, msgPregunta);
    registrarLog(telefono, 'saliente', msgPregunta).catch(() => {});
    return;
  }

  switch (estado.paso_actual) {
    case 'inicio': {
      const bienvenida = await obtenerTextoBot(
        'bienvenida',
        '👋 ¡Hola! Bienvenido al Colegio Virtual Educando para la Vida 🎓✨. Somos una institución educativa 100% autorizada por el Ministerio de Educación 📚. Para brindarle información personalizada sobre matrículas y tarifas, por favor indique su *Nombre Completo* (Nombres y Apellidos) ✍️:'
      );
      await enviarMensajeTexto(telefono, bienvenida);
      registrarLog(telefono, 'saliente', bienvenida).catch(() => {});
      await actualizarConversacion(telefono, { paso_actual: 'nombre' });
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
        paso_actual: 'telefono',
      });

      const msg = `🌟 ¡Muchas gracias, ${textoLimpio}! 📲 Indique su número telefónico de contacto (Escriba *"este"* si es este mismo número de WhatsApp):`;
      await enviarMensajeTexto(telefono, msg);
      registrarLog(telefono, 'saliente', msg).catch(() => {});
      break;
    }

    case 'telefono': {
      let numContacto = textoLimpio;
      if (textoNorm === 'este' || textoNorm === 'el mismo') {
        numContacto = telefono;
      }

      await actualizarConversacion(telefono, {
        telefono_temp: numContacto,
        paso_actual: 'programa',
      });

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
      const mensajeBody = 'Indique en cuál grado o nivel educativo se encuentra interesado/a 👇:';
      
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

      const estadoActualizado = {
        ...estado,
        programa_temp: gradoSeleccionadoText,
        paso_actual: 'confirmacion',
      };

      await actualizarConversacion(telefono, {
        programa_temp: gradoSeleccionadoText,
        paso_actual: 'confirmacion',
      });

      // Enviar menú de aceptación / corrección con números
      await enviarMensajeConfirmacionDatos(telefono, estadoActualizado);
      break;
    }

    case 'confirmacion': {
      // Opciones: 4 = Correcto, 1 = Editar Nombre, 2 = Editar Teléfono, 3 = Editar Grado
      if (textoNorm === '4' || textoNorm === 'correcto' || textoNorm === 'si' || textoNorm === 'aceptar' || textoNorm === 'ok' || textoNorm === 'confirmar') {
        const nombreFinal = estado.nombre_temp || 'Interesado';
        const telefonoContactoFinal = estado.telefono_temp || telefono;
        const gradoFinal = estado.programa_temp || 'Sin grado';

        const gradosDisponibles = await obtenerGradosDinamicos();
        const gradoEncontrado = gradosDisponibles.find((g) => g.nombre.toLowerCase() === gradoFinal.toLowerCase());
        const gradoId = gradoEncontrado ? gradoEncontrado.id : null;

        // 1. Marcar conversación como finalizada INMEDIATAMENTE
        await actualizarConversacion(telefono, { paso_actual: 'finalizado' });

        // 2. Guardar Lead en la base de datos (con try/catch seguro interno)
        try {
          await guardarLead(telefono, nombreFinal, telefonoContactoFinal, gradoId, gradoFinal);
        } catch (e) {
          console.error('Error guardando lead:', e.message);
        }

        // 3. Enviar mensaje de confirmación final
        const confirmacion = `🎉 ¡Muchas gracias, ${nombreFinal}! ✨ Hemos registrado exitosamente su solicitud para el programa: *${gradoFinal}* 🎓. Un asesor académico de admisiones se comunicará con usted a la brevedad 📲.\n\n(Escriba *REINICIAR* en cualquier momento si desea realizar otra consulta) 🌟.`;
        await enviarMensajeTexto(telefono, confirmacion);
        registrarLog(telefono, 'saliente', confirmacion).catch(() => {});
      } else if (textoNorm === '1' || textoNorm === 'nombre') {
        await actualizarConversacion(telefono, { paso_actual: 'nombre' });
        const msg = '✍️ Por favor indique su *Nombre Completo* (Nombres y Apellidos) corregido:';
        await enviarMensajeTexto(telefono, msg);
        registrarLog(telefono, 'saliente', msg).catch(() => {});
      } else if (textoNorm === '2' || textoNorm === 'telefono' || textoNorm === 'celular') {
        await actualizarConversacion(telefono, { paso_actual: 'telefono' });
        const msg = '📲 Por favor indique su número telefónico de contacto corregido:';
        await enviarMensajeTexto(telefono, msg);
        registrarLog(telefono, 'saliente', msg).catch(() => {});
      } else if (textoNorm === '3' || textoNorm === 'grado' || textoNorm === 'programa') {
        await actualizarConversacion(telefono, { paso_actual: 'programa' });
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
        const mensajeHeader = 'Re-selección de Grado 🎓';
        const mensajeBody = 'Por favor indique en cuál grado se encuentra interesado/a 👇:';
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
      } else {
        // Opción no reconocida, re-enviar la tarjeta de confirmación
        await enviarMensajeConfirmacionDatos(telefono, estado);
      }
      break;
    }

    case 'finalizado': {
      if (respuestaFaq) {
        await enviarMensajeTexto(telefono, respuestaFaq);
        registrarLog(telefono, 'saliente', respuestaFaq).catch(() => {});
      } else {
        await enviarMenuOpcionesFaq(telefono);
      }
      break;
    }

    default: {
      await actualizarConversacion(telefono, { paso_actual: 'inicio' });
      await procesarMensaje(telefono, mensajeTexto);
    }
  }
}

module.exports = {
  procesarMensaje,
};
