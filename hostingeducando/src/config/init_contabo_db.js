const pool = require('./db');

/**
 * Script de inicialización atómica de tablas para la nueva BD de Contabo
 */
async function inicializarTablasContabo() {
  console.log('⚡ Inicializando estructura de tablas en la nueva BD de Contabo...');

  try {
    // 1. Tabla de Usuarios Admin
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_admin (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        rol ENUM('superadmin', 'administrador', 'asesor') DEFAULT 'administrador',
        activo BOOLEAN DEFAULT TRUE,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Tabla de Grados Educativos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grados (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        orden INT DEFAULT 1,
        activo BOOLEAN DEFAULT TRUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Tabla de Paquetes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS paquetes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        precio DECIMAL(10,2) NOT NULL,
        activo BOOLEAN DEFAULT TRUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Tabla de Leads Fase 2 (CRM)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads_fase2 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telefono VARCHAR(30) NOT NULL UNIQUE,
        nombre_contacto VARCHAR(100) NOT NULL,
        apellido_contacto VARCHAR(100),
        es_acudiente BOOLEAN DEFAULT FALSE,
        nombre_estudiante VARCHAR(100),
        edad_estudiante INT,
        grado_interes_id INT,
        paquete_interes_id INT,
        ciudad VARCHAR(100),
        departamento VARCHAR(100),
        estado_embudo ENUM('nuevo', 'contactado', 'en_proceso', 'matriculado', 'descartado') DEFAULT 'nuevo',
        asesor_asignado_id INT,
        notas_internas TEXT,
        habeas_data_aceptado BOOLEAN DEFAULT TRUE,
        puntaje INT DEFAULT 30,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (grado_interes_id) REFERENCES grados(id) ON DELETE SET NULL,
        FOREIGN KEY (paquete_interes_id) REFERENCES paquetes(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Tabla de Leads Legados/Respaldo
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telefono VARCHAR(30) NOT NULL UNIQUE,
        nombre VARCHAR(100) NOT NULL,
        apellido VARCHAR(100),
        programa_interes VARCHAR(100),
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
        origen VARCHAR(50) DEFAULT 'whatsapp_bot'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Tabla de Conversaciones (Maquina de Estados)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telefono VARCHAR(50) NOT NULL UNIQUE,
        paso_actual VARCHAR(50) DEFAULT 'inicio',
        nombre_temp VARCHAR(100),
        apellido_temp VARCHAR(100),
        telefono_temp VARCHAR(50),
        programa_temp VARCHAR(100),
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Tabla de Logs de Mensajes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mensajes_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telefono VARCHAR(50) NOT NULL,
        direccion ENUM('entrante', 'saliente') NOT NULL,
        contenido TEXT NOT NULL,
        fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Tabla de Mensajes del Bot (Administrables)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_mensajes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        clave VARCHAR(50) NOT NULL UNIQUE,
        titulo VARCHAR(100) NOT NULL,
        contenido TEXT NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. Tabla de Base de Conocimiento (FAQs)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS base_conocimiento (
        id INT AUTO_INCREMENT PRIMARY KEY,
        categoria VARCHAR(50) DEFAULT 'General',
        pregunta_frecuente TEXT NOT NULL,
        respuesta_aprobada TEXT NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ Estructura de tablas verificada e inicializada exitosamente en Contabo MySQL');

    // Inicializar semillas de datos (FAQs, Grados y Mensajes)
    const { sembrarDatosIniciales } = require('./seed');
    await sembrarDatosIniciales();

  } catch (error) {
    console.error('❌ Error al inicializar tablas en Contabo MySQL:', error.message);
  }
}

module.exports = {
  inicializarTablasContabo
};
