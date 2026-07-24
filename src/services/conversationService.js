const pool = require('../config/db');
const { enviarMensajeTexto, enviarMensajeLista } = require('./whatsappService');

// Opciones de programas escolares del colegio
const PROGRAMAS_DISPONIBLES = [
  'Preescolar / Jardín',
  'Primaria Básica',
  'Secundaria / Bachillerato',
  'Educación Técnica / Bachillerato Técnico',
  'Otro / Información General',
];

/**
 * Obtener o crear el estado de la conversación para un número determinado
 */
async function obtenerEstadoConversacion(telefono) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM conversaciones WHERE telefono = ?',
      [telefono]
    );

    if (rows.length > 0) {
      return rows[0];
    }

    // Crear nuevo estado inicial
    await pool.query(
      'INSERT INTO conversaciones (telefono, paso_actual) VALUES (?, ?)',
      [telefono, 'inicio']
    );

    return {
      telefono,
      paso_actual: 'inicio',
      nombre_temp: null,
      apellido_temp: null,
      telefono_temp: null,
      programa_temp: null,
    };
  } catch (error) {
    console.error('Error al obtener estado conversacional:', error.message);
    return { paso_actual: 'inicio' };
  }
}

/**
 * Actualizar el estado de la conversación en la BD
 */
async function actualizarConversacion(telefono, nuevosCampos) {
  try {
    const setClause = Object.keys(nuevosCampos)
      .map((key) => `${key} = ?`)
      .join(', ');
    const values = [...Object.values(nuevosCampos), telefono];

    await pool.query(
      `UPDATE conversaciones SET ${setClause} WHERE telefono = ?`,
      values
    );
  } catch (error) {
    console.error('Error al actualizar conversación:', error.message);
  }
}

/**
 * Guardar el Lead final en la tabla 'leads'
 */
async function guardarLead(telefono, nombre, apellido, programa) {
  try {
    await pool.query(
      `INSERT INTO leads (telefono, nombre, apellido, programa_interes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre=?, apellido=?, programa_interes=?, fecha_registro=NOW()`,
      [telefono, nombre, apellido, programa, nombre, apellido, programa]
    );
    console.log(` Lead guardado exitosamente para ${nombre} ${apellido} (${telefono})`);
  } catch (error) {
    console.error('Error al guardar lead en MySQL:', error.message);
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
    console.error('Error guardando log de mensaje:', error.message);
  }
}

/**
 * Procesar mensaje entrante del usuario (Máquina de Estados)
 */
async function procesarMensaje(telefono, mensajeTexto) {
  const textoLimpio = mensajeTexto ? mensajeTexto.trim() : '';
  await registrarLog(telefono, 'entrante', textoLimpio);

  // Comando global para reiniciar conversación
  if (textoLimpio.toLowerCase() === 'reiniciar' || textoLimpio.toLowerCase() === 'cancelar' || textoLimpio.toLowerCase() === 'inicio') {
    await actualizarConversacion(telefono, {
      paso_actual: 'inicio',
      nombre_temp: null,
      apellido_temp: null,
      telefono_temp: null,
      programa_temp: null,
    });
    const msg = ' ¡Hola! Bienvenido nuevamente al Colegio Educando para la Vida. Vamos a iniciar el registro.\n\nPor favor, dinos tu **primer nombre**:';
    await enviarMensajeTexto(telefono, msg);
    await registrarLog(telefono, 'saliente', msg);
    await actualizarConversacion(telefono, { paso_actual: 'nombre' });
    return;
  }

  const estado = await obtenerEstadoConversacion(telefono);

  switch (estado.paso_actual) {
    case 'inicio': {
      const msg = ' ¡Hola! Bienvenido al Colegio Educando para la Vida.\n\nNos alegra mucho tu interés. Para brindarte la mejor asesoría, nos gustaría capturar tus datos básicos.\n\n¿Cuál es tu **nombre**?';
      await enviarMensajeTexto(telefono, msg);
      await registrarLog(telefono, 'saliente', msg);
      await actualizarConversacion(telefono, { paso_actual: 'nombre' });
      break;
    }

    case 'nombre': {
      if (!textoLimpio) {
        const msg = 'Por favor escribe tu nombre para continuar:';
        await enviarMensajeTexto(telefono, msg);
        await registrarLog(telefono, 'saliente', msg);
        return;
      }
      await actualizarConversacion(telefono, {
        nombre_temp: textoLimpio,
        paso_actual: 'apellido',
      });
      const msg = `¡Gracias, ${textoLimpio}! Ahora, ¿cuál es tu **apellido**?`;
      await enviarMensajeTexto(telefono, msg);
      await registrarLog(telefono, 'saliente', msg);
      break;
    }

    case 'apellido': {
      if (!textoLimpio) {
        const msg = 'Por favor escribe tu apellido para continuar:';
        await enviarMensajeTexto(telefono, msg);
        await registrarLog(telefono, 'saliente', msg);
        return;
      }
      await actualizarConversacion(telefono, {
        apellido_temp: textoLimpio,
        paso_actual: 'telefono',
      });
      const msg = 'Perfecto. ¿Cuál es tu **número de teléfono de contacto**? (Si es este mismo número de WhatsApp, puedes responder escribiendo "este")';
      await enviarMensajeTexto(telefono, msg);
      await registrarLog(telefono, 'saliente', msg);
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

      // Enviar lista interactiva de programas
      const secciones = [
        {
          title: 'Programas Educativos',
          rows: PROGRAMAS_DISPONIBLES.map((prog, index) => ({
            id: `prog_${index + 1}`,
            title: prog,
          })),
        },
      ];

      const mensajeHeader = 'Oferta Educativa';
      const mensajeBody = '¿En qué **programa de interés** o nivel estás interesado/a?\n\nResponde seleccionando de la lista o escribe el nombre del programa:';
      
      try {
        await enviarMensajeLista(telefono, mensajeBody, mensajeHeader, secciones);
      } catch (err) {
        let fallbackMsg = `${mensajeBody}\n\n`;
        PROGRAMAS_DISPONIBLES.forEach((p, idx) => {
          fallbackMsg += `${idx + 1}. ${p}\n`;
        });
        await enviarMensajeTexto(telefono, fallbackMsg);
      }

      await registrarLog(telefono, 'saliente', mensajeBody);
      break;
    }

    case 'programa': {
      let programaSeleccionado = textoLimpio;

      // Si el usuario escribió un número del 1 al 5 en el fallback
      const idxNum = parseInt(textoLimpio) - 1;
      if (!isNaN(idxNum) && PROGRAMAS_DISPONIBLES[idxNum]) {
        programaSeleccionado = PROGRAMAS_DISPONIBLES[idxNum];
      }

      const nombreFinal = estado.nombre_temp || 'Interesado';
      const apellidoFinal = estado.apellido_temp || '';
      const telefonoContactoFinal = estado.telefono_temp || telefono;

      // Guardar Lead en la base de datos MySQL
      await guardarLead(telefonoContactoFinal, nombreFinal, apellidoFinal, programaSeleccionado);

      await actualizarConversacion(telefono, {
        programa_temp: programaSeleccionado,
        paso_actual: 'finalizado',
      });

      const confirmacion = ` ¡Muchas gracias, ${nombreFinal}!\n\nHemos registrado correctamente tu solicitud para el programa:\n **${programaSeleccionado}**\n\nUn asesor de admisiones de Educando para la Vida se pondrá en contacto contigo muy pronto.\n\n*(Si deseas registrar otra consulta, puedes escribir **REINICIAR** en cualquier momento)*.`;
      
      await enviarMensajeTexto(telefono, confirmacion);
      await registrarLog(telefono, 'saliente', confirmacion);
      break;
    }

    case 'finalizado': {
      const msg = `¡Hola de nuevo ${estado.nombre_temp || ''}! Ya tenemos tus datos de contacto registrados.\n\nSi deseas reiniciar el formulario para ingresar otra información, escribe **REINICIAR**.`;
      await enviarMensajeTexto(telefono, msg);
      await registrarLog(telefono, 'saliente', msg);
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
