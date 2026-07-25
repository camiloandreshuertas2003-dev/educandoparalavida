const pool = require('../config/db');
const { enviarMensajeTexto, enviarMensajeLista } = require('./whatsappService');

// Fallback en memoria por si la base de datos remota tiene alta latencia
const estadosEnMemoria = new Map();

/**
 * Obtener mensaje personalizado del bot desde la base de datos (o usar texto por defecto profesional sin emojis)
 */
async function obtenerTextoBot(clave, textoPorDefecto) {
  try {
    const [rows] = await pool.query('SELECT contenido FROM bot_mensajes WHERE clave = ? AND activo = TRUE', [clave]);
    if (rows && rows.length > 0 && rows[0].contenido) {
      return rows[0].contenido.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '');
    }
  } catch (err) {
    // Si falla la BD, retorna el texto por defecto
  }
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
  } catch (err) {
    console.warn('⚠️ No se pudieron cargar los grados desde MySQL, usando lista fallback.');
  }

  return [
    { id: 1, nombre: 'Preescolar / Transicion' },
    { id: 2, nombre: 'Primaria (1 a 5)' },
    { id: 3, nombre: 'Secundaria (6 a 9)' },
    { id: 4, nombre: 'Media Academica (10 y 11)' },
    { id: 5, nombre: 'Bachillerato por Ciclos (CLEI Adultos)' },
  ];
}

/**
 * Obtener estado de la conversación con persistencia en MySQL y respaldo en memoria
 */
async function obtenerEstadoConversacion(telefono) {
  try {
    const [rows] = await pool.query('SELECT * FROM conversaciones WHERE telefono = ?', [telefono]);
    if (rows && rows.length > 0) {
      const estadoBD = rows[0];
      estadosEnMemoria.set(telefono, estadoBD);
      return estadoBD;
    }
  } catch (error) {
    console.warn(`⚠️ Error consultando estado en BD para ${telefono}:`, error.message);
  }

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
    console.log(` Estado de conversación actualizado en BD para ${telefono}: paso_actual -> "${actualizado.paso_actual}"`);
  } catch (error) {
    console.error(` Error actualizando conversación en BD para ${telefono}:`, error.message);
  }
}

/**
 * Guardar el Lead final en la tabla 'leads_fase2'
 */
async function guardarLead(telefono, nombre, apellido, gradoId, gradoTexto) {
  try {
    await pool.query(
      `INSERT INTO leads_fase2 (telefono, nombre_contacto, apellido_contacto, grado_interes_id, habeas_data_aceptado)
       VALUES (?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE nombre_contacto=?, apellido_contacto=?, grado_interes_id=?, actualizado_en=NOW()`,
      [telefono, nombre, apellido, gradoId || null, nombre, apellido, gradoId || null]
    );

    await pool.query(
      `INSERT INTO leads (telefono, nombre, apellido, programa_interes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre=?, apellido=?, programa_interes=?, fecha_registro=NOW()`,
      [telefono, nombre, apellido, gradoTexto, nombre, apellido, gradoTexto]
    );

    console.log(` Lead registrado exitosamente para ${nombre} ${apellido} (${telefono})`);
  } catch (error) {
    console.error(' Error al guardar lead en MySQL:', error.message);
  }
}

/**
 * Guardar log del mensaje entrante/saliente
 */
async function registrarLog(telefono, direccion, contenido) {
  try {
    await pool.query(
      'INSERT INTO mensajes_log (telefono, direccion, contenido) VALUES (?, ?, ?)',
      [telefono, direccion, contenido]
    );
  } catch (error) {
    // Ignorar si falla el log
  }
}

/**
 * Procesar mensaje entrante del usuario (Flujo Completo de Captación)
 */
async function procesarMensaje(telefono, mensajeTexto) {
  const textoLimpio = mensajeTexto ? mensajeTexto.trim() : '';
  console.log(` PROCESANDO FLUIDO DE CONVERSACIÓN para ${telefono}. Mensaje: "${textoLimpio}"`);
  registrarLog(telefono, 'entrante', textoLimpio).catch(() => {});

  // Comando global para reiniciar conversación
  if (textoLimpio.toLowerCase() === 'reiniciar' || textoLimpio.toLowerCase() === 'cancelar' || textoLimpio.toLowerCase() === 'inicio') {
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

  const estado = await obtenerEstadoConversacion(telefono);
  console.log(` PASO ACTUAL DE CONVERSACIÓN para ${telefono}: "${estado.paso_actual}"`);

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
      if (textoLimpio.toLowerCase() === 'este' || textoLimpio.toLowerCase() === 'el mismo') {
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
      const msg = `Bienvenido nuevamente. Su solicitud previa ya fue registrada. Si desea reiniciar el formulario para ingresar otra informacion, escriba REINICIAR.`;
      await enviarMensajeTexto(telefono, msg);
      registrarLog(telefono, 'saliente', msg).catch(() => {});
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
