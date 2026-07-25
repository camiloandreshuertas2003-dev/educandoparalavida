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

  // Respuestas predeterminadas institucionales adaptadas a errores fonéticos
  if (textoNorm.includes('precio')) {
    return 'En el Colegio Virtual Educando para la Vida los costos son muy accesibles. Ofrecemos mensualidades economicas con facilidades de pago. Al registrar sus datos, le enviaremos la tarifa exacta para su grado.';
  }
  if (textoNorm.includes('vivo')) {
    return 'Ofrecemos un modelo flexible 100% virtual con plataforma 24/7, clases en vivo interactivas y tutorias personalizadas para aprender a su propio ritmo.';
  }
  if (textoNorm.includes('titulo')) {
    return 'Contamos con resolucion oficial expedida por la Secretaria de Educacion conforme a la Ley 115. El titulo de Bachiller es 100% legal y valido para ingresar a universidades.';
  }
  if (textoNorm.includes('requisito')) {
    return 'Se requiere fotocopia del documento de identidad del estudiante y acudiente, certificado del ultimo ano cursado y recibo de pago de matricula.';
  }

  return null;
}

/**
 * Despachar menú interactivo de opciones cuando el mensaje no se entiende o se solicita ayuda
 */
async function enviarMenuOpcionesFaq(telefono) {
  const secciones = [
    {
      title: 'Consultas Frecuentes',
      rows: [
        { id: 'faq_precios', title: 'Precios y Pensiones' },
        { id: 'faq_clases', title: 'Clases y Metodologia' },
        { id: 'faq_titulo', title: 'Titulo Oficial MEN' },
        { id: 'faq_requisitos', title: 'Requisitos de Matricula' },
        { id: 'faq_horarios', title: 'Horarios de Atencion' },
      ],
    },
  ];

  const header = 'Menu de Ayuda - Colegio Virtual';
  const body = 'Seleccione la opcion de su interes o indique su nombre completo para continuar el registro:';

  try {
    await enviarMensajeLista(telefono, body, header, secciones);
  } catch (e) {
    const textFallback = `${body}\n\n1. Precios y Pensiones\n2. Clases y Metodologia\n3. Titulo Oficial MEN\n4. Requisitos de Matricula\n5. Horarios de Atencion`;
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
      return rows[0].contenido.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '');
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
    { id: 1, nombre: 'Preescolar / Transicion' },
    { id: 2, nombre: 'Primaria (1 a 5)' },
    { id: 3, nombre: 'Secundaria (6 a 9)' },
    { id: 4, nombre: 'Media Academica (10 y 11)' },
    { id: 5, nombre: 'Bachillerato por Ciclos (CLEI Adultos)' },
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
async function guardarLead(telefono, nombre, apellido, gradoId, gradoTexto) {
  try {
    let puntaje = 30;
    if (nombre && apellido) puntaje += 20;

    await pool.query(
      `INSERT INTO leads_fase2 (telefono, nombre_contacto, apellido_contacto, grado_interes_id, habeas_data_aceptado, puntaje)
       VALUES (?, ?, ?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE nombre_contacto=?, apellido_contacto=?, grado_interes_id=?, puntaje=?, actualizado_en=NOW()`,
      [telefono, nombre, apellido, gradoId || null, puntaje, nombre, apellido, gradoId || null, puntaje]
    );

    await pool.query(
      `INSERT INTO leads (telefono, nombre, apellido, programa_interes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre=?, apellido=?, programa_interes=?, fecha_registro=NOW()`,
      [telefono, nombre, apellido, gradoTexto, nombre, apellido, gradoTexto]
    );

    console.log(` Lead registrado exitosamente con scoring ${puntaje} para ${nombre} ${apellido} (${telefono})`);
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
 * Procesar mensaje entrante con Tolerancia a Mala Ortografía + Menú de Opciones
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
    
    const bienvenida = 'Bienvenido al Colegio Virtual Educando para la Vida. Somos una institucion educativa autorizada. Para brindarle informacion sobre matriculas, por favor indique su nombre completo:';
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

  if (respuestaFaq && estado.paso_actual !== 'inicio' && estado.paso_actual !== 'finalizado') {
    let msgPregunta = `${respuestaFaq}\n\n`;
    if (estado.paso_actual === 'nombre') msgPregunta += 'Para continuar con su registro, por favor indique su nombre completo:';
    else if (estado.paso_actual === 'apellido') msgPregunta += 'Para continuar, por favor indique su apellido:';
    else if (estado.paso_actual === 'telefono') msgPregunta += 'Indique su numero telefonico de contacto:';
    else if (estado.paso_actual === 'programa') msgPregunta += 'Indique el grado educativo de su interes:';

    await enviarMensajeTexto(telefono, msgPregunta);
    registrarLog(telefono, 'saliente', msgPregunta).catch(() => {});
    return;
  }

  switch (estado.paso_actual) {
    case 'inicio': {
      const bienvenida = await obtenerTextoBot(
        'bienvenida',
        'Bienvenido al Colegio Virtual Educando para la Vida. Somos una institucion educativa autorizada. Para brindarle informacion personalizada sobre matriculas, por favor indique su nombre completo:'
      );
      await enviarMensajeTexto(telefono, bienvenida);
      registrarLog(telefono, 'saliente', bienvenida).catch(() => {});
      await actualizarConversacion(telefono, { paso_actual: 'nombre' });
      break;
    }

    case 'nombre': {
      if (!textoLimpio) {
        const msg = 'Por favor indique su nombre completo para continuar:';
        await enviarMensajeTexto(telefono, msg);
        registrarLog(telefono, 'saliente', msg).catch(() => {});
        return;
      }

      await actualizarConversacion(telefono, {
        nombre_temp: textoLimpio,
        paso_actual: 'apellido',
      });

      const msg = `Gracias, ${textoLimpio}. A continuacion, por favor indique su apellido:`;
      await enviarMensajeTexto(telefono, msg);
      registrarLog(telefono, 'saliente', msg).catch(() => {});
      break;
    }

    case 'apellido': {
      if (!textoLimpio) {
        const msg = 'Por favor indique su apellido para continuar:';
        await enviarMensajeTexto(telefono, msg);
        registrarLog(telefono, 'saliente', msg).catch(() => {});
        return;
      }

      await actualizarConversacion(telefono, {
        apellido_temp: textoLimpio,
        paso_actual: 'telefono',
      });

      const msg = 'Perfecto. Indique su numero telefonico de contacto (Escriba "este" si es el mismo numero de WhatsApp):';
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
          title: 'Grados Disponibles',
          rows: gradosDisponibles.map((g) => ({
            id: `g_${g.id}`,
            title: g.nombre,
          })),
        },
      ];

      const mensajeHeader = 'Oferta Academica 2026';
      const mensajeBody = 'Indique en cual grado o nivel educativo se encuentra interesado/a:';
      
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
      let gradoId = null;

      const gradoEncontrado = gradosDisponibles.find(
        (g) => g.nombre.toLowerCase() === textoLimpio.toLowerCase() || `g_${g.id}` === textoLimpio
      );

      if (gradoEncontrado) {
        gradoSeleccionadoText = gradoEncontrado.nombre;
        gradoId = gradoEncontrado.id;
      } else {
        const idxNum = parseInt(textoLimpio) - 1;
        if (!isNaN(idxNum) && gradosDisponibles[idxNum]) {
          gradoSeleccionadoText = gradosDisponibles[idxNum].nombre;
          gradoId = gradosDisponibles[idxNum].id;
        }
      }

      const nombreFinal = estado.nombre_temp || 'Interesado';
      const apellidoFinal = estado.apellido_temp || '';
      const telefonoContactoFinal = estado.telefono_temp || telefono;

      // Guardar Lead
      await guardarLead(telefonoContactoFinal, nombreFinal, apellidoFinal, gradoId, gradoSeleccionadoText);

      await actualizarConversacion(telefono, {
        programa_temp: gradoSeleccionadoText,
        paso_actual: 'finalizado',
      });

      const confirmacion = `Muchas gracias, ${nombreFinal}. Hemos registrado correctamente su solicitud para el programa: ${gradoSeleccionadoText}. Un asesor academico de admisiones se comunicara con usted a la brevedad.\n\n(Puede escribir REINICIAR en cualquier momento si desea realizar otra consulta).`;
      
      await enviarMensajeTexto(telefono, confirmacion);
      registrarLog(telefono, 'saliente', confirmacion).catch(() => {});
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
