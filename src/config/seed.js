const pool = require('./db');

function limpiarTextoParaMysql(str) {
  if (!str) return '';
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
}

async function sembrarDatosIniciales() {
  try {
    // Limpiar claves antiguas fuera del orden estricto de 4 pasos
    const clavesNuevas = ['paso_1_bienvenida', 'paso_2_telefono', 'paso_3_grado', 'paso_4_despedida', 'bienvenida', 'solicitar_telefono', 'seleccion_grado', 'despedida'];
    await pool.query('DELETE FROM bot_mensajes WHERE clave NOT IN (?, ?, ?, ?, ?, ?, ?, ?)', clavesNuevas);

    // 1. Mensajes Administrables del Bot para los 4 pasos del flujo en estricto orden cronologico
    const mensajesIniciales = [
      [
        1,
        'paso_1_bienvenida',
        'Paso 1: Saludo y Solicitud de Nombre Completo',
        '👋 ¡Hola! Bienvenido al Colegio Virtual Educando para la Vida 🎓✨. Somos una institución educativa 100% autorizada por la Secretaría de Educación 📚.\n\nPara iniciar su registro, ¿cuál es su *Nombre Completo* (Nombres y Apellidos)? ✍️'
      ],
      [
        2,
        'paso_2_telefono',
        'Paso 2: Solicitud de Número Telefónico de Contacto',
        '📱 Por favor escriba su *Número de Teléfono / Celular de Contacto* para enviarle la información oficial (Ejemplo: 3218423914): ✍️'
      ],
      [
        3,
        'paso_3_grado',
        'Paso 3: Cabecera Menú de Oferta Académica de Grados',
        '🎓 Seleccione el *Grado Educativo* de su interés enviando el número correspondiente 👇:'
      ],
      [
        4,
        'paso_4_despedida',
        'Paso 4: Confirmación Final de Inscripción Exitosa',
        '🎉 ¡Muchas gracias! Hemos registrado exitosamente su solicitud de inscripción 🎓. Un asesor académico de admisiones se comunicará con usted a la brevedad 📲.'
      ]
    ];

    for (const [id, clave, titulo, contenido] of mensajesIniciales) {
      const cleanContenido = limpiarTextoParaMysql(contenido);
      await pool.query(
        `INSERT INTO bot_mensajes (id, clave, titulo, contenido, activo) 
         VALUES (?, ?, ?, ?, TRUE) 
         ON DUPLICATE KEY UPDATE id=?, clave=?, titulo=?, contenido=?`,
        [id, clave, titulo, cleanContenido, id, clave, titulo, cleanContenido]
      );
    }

    // 2. Base de Conocimiento (FAQs por defecto en MySQL)
    const faqsIniciales = [
      ['Costos', '¿Cuáles son las pensiones, matrículas y costos?', '💡 En el Colegio Virtual Educando para la Vida 🎓 los costos son muy accesibles. Ofrecemos mensualidades económicas con facilidades de pago 💸. Al registrar sus datos en este WhatsApp, le enviaremos la tarifa exacta para su grado 📚.'],
      ['Metodología', '¿Cómo son las clases en vivo y los horarios?', '💻 Ofrecemos un modelo flexible 100% virtual con plataforma disponible 24/7, clases en vivo interactivas 🎥 y tutorías personalizadas para aprender a su propio ritmo ✨.'],
      ['Validez', '¿El título de Bachiller es oficial y válido ante el MEN/ICFES?', '📜 Contamos con resolución oficial expedida por la Secretaría de Educación conforme a la Ley 115. El título de Bachiller es 100% legal y válido para ingresar a cualquier universidad 🏛️✨.'],
      ['Requisitos', '¿Cuáles son los requisitos y documentos de ingreso?', '📋 Se requiere fotocopia del documento de identidad del estudiante y acudiente 📄, certificado del último año cursado y recibo de pago de matrícula ✍️.'],
      ['Ubicación', '¿Dónde están ubicados y cuáles son los horarios de atención?', '🏢 Nuestra sede principal de admisiones atiende de Lunes a Viernes de 8:00 AM a 6:00 PM y Sábados de 8:00 AM a 1:00 PM ⏰. La formación es 100% virtual a nivel nacional 🌐.']
    ];

    for (const [cat, preg, resp] of faqsIniciales) {
      const cleanResp = limpiarTextoParaMysql(resp);
      await pool.query(
        `INSERT INTO base_conocimiento (categoria, pregunta_frecuente, respuesta_aprobada, activo)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE respuesta_aprobada=?`,
        [cat, preg, cleanResp, cleanResp]
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

    console.log('✅ Pasos del Bot ordenados (1 al 4), FAQs y Grados restaurados exitosamente en MySQL');
  } catch (err) {
    console.warn('⚠️ Nota sembrando datos iniciales:', err.message);
  }
}

module.exports = { sembrarDatosIniciales };
