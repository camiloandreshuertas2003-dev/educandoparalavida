const pool = require('./db');

function limpiarTextoParaMysql(str) {
  if (!str) return '';
  // Remover caracteres de 4 bytes (emojis de mas de 3 bytes) para asegurar compatibilidad con tablas utf8 o utf8mb4
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
}

async function sembrarDatosIniciales() {
  try {
    // 1. Mensajes Administrables del Bot
    const mensajesIniciales = [
      ['bienvenida', 'Bienvenida Oficial', 'Hola! Bienvenido al Colegio Virtual Educando para la Vida. Somos una institución educativa 100% autorizada por el Ministerio de Educación.\n\nPara iniciar su solicitud de matrícula, ¿cuál es su *Nombre Completo* (Nombres y Apellidos)?'],
      ['despedida', 'Despedida e Inscripción Exitosa', 'Muchas gracias! Hemos registrado exitosamente su solicitud. Un asesor académico de admisiones se comunicará con usted a la brevedad.'],
      ['menu_faq', 'Menú de Ayuda FAQ', 'Menú de Ayuda\nSeleccione la opción de su interés o indique su nombre completo para continuar su registro:']
    ];

    for (const [clave, titulo, contenido] of mensajesIniciales) {
      await pool.query(
        `INSERT INTO bot_mensajes (clave, titulo, contenido, activo) 
         VALUES (?, ?, ?, TRUE) 
         ON DUPLICATE KEY UPDATE titulo=?, contenido=?`,
        [clave, titulo, contenido, titulo, contenido]
      );
    }

    // 2. Base de Conocimiento (FAQs)
    const faqsIniciales = [
      ['precios', '¿Cuáles son las pensiones y costos?', 'En el Colegio Virtual Educando para la Vida los costos son muy accesibles. Ofrecemos mensualidades económicas con facilidades de pago. Al registrar sus datos en este WhatsApp, le enviaremos la tarifa exacta para su grado.'],
      ['clases', '¿Cómo son las clases y la metodología?', 'Ofrecemos un modelo flexible 100% virtual con plataforma disponible 24/7, clases en vivo interactivas y tutorías personalizadas para aprender a su propio ritmo.'],
      ['titulo', '¿El título de Bachiller es oficial?', 'Contamos con resolución oficial expedida por la Secretaría de Educación conforme a la Ley 115. El título de Bachiller es 100% legal y válido para ingresar a cualquier universidad.'],
      ['requisitos', '¿Cuáles son los requisitos de matrícula?', 'Se requiere fotocopia del documento de identidad del estudiante y acudiente, certificado del último año cursado y recibo de pago de matrícula.'],
      ['horarios', '¿Cuáles son los horarios de atención?', 'Nuestro equipo de admisiones atiende de Lunes a Viernes de 8:00 AM a 6:00 PM y Sábados de 8:00 AM a 1:00 PM.']
    ];

    for (const [cat, preg, resp] of faqsIniciales) {
      await pool.query(
        `INSERT INTO base_conocimiento (categoria, pregunta_frecuente, respuesta_aprobada, activo)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE respuesta_aprobada=?`,
        [cat, preg, resp, resp]
      );
    }

    // 3. Grados Educativos (Oferta Académica sin emojis de 4 bytes)
    const gradosIniciales = [
      [1, 1, 'Preescolar / Transicion', 1],
      [2, 2, 'Primaria (1 a 5)', 2],
      [3, 2, 'Secundaria (6 a 9)', 3],
      [4, 3, 'Media Académica (10 y 11)', 4],
      [5, 3, 'Bachillerato por Ciclos (CLEI)', 5]
    ];

    for (const [id, nivel_id, nombre, orden] of gradosIniciales) {
      const cleanNombre = limpiarTextoParaMysql(nombre);
      await pool.query(
        `INSERT INTO grados (id, nivel_id, nombre, orden, activo)
         VALUES (?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE nombre=?, orden=?`,
        [id, nivel_id, cleanNombre, orden, cleanNombre, orden]
      );
    }

    console.log('✅ Mensajes del Bot, FAQs y Grados restaurados exitosamente en la base de datos');
  } catch (err) {
    console.warn('⚠️ Nota sembrando datos iniciales:', err.message);
  }
}

module.exports = { sembrarDatosIniciales };
