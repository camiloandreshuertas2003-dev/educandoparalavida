-- =============================================================================
-- SCRIPT DE MIGRACIÓN FASE 2 (CORREGIDO PARA EMOJIS Y UTF8MB4)
-- Base de Datos: ki11745159_educandoparalavida
-- =============================================================================

USE ki11745159_educandoparalavida;

-- ASEGURAR QUE LA BASE DE DATOS SOPORTE EMOJIS (utf8mb4 de 4 bytes)
ALTER DATABASE ki11745159_educandoparalavida CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 1. NIVELES EDUCATIVOS
CREATE TABLE IF NOT EXISTS niveles_educativos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  orden INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO niveles_educativos (id, nombre, orden) VALUES
(1, 'Preescolar (Transición / Jardín)', 1),
(2, 'Primaria Básica (1° a 5°)', 2),
(3, 'Secundaria (6° a 9°)', 3),
(4, 'Media Académica / Bachillerato (10° y 11°)', 4),
(5, 'Bachillerato por Ciclos (CLEI Adultos / Acelerado)', 5)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

-- 2. GRADOS ESCOLARES
CREATE TABLE IF NOT EXISTS grados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nivel_id INT NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (nivel_id) REFERENCES niveles_educativos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO grados (id, nivel_id, nombre, orden) VALUES
(1, 1, 'Pre-Jardín y Transición', 1),
(2, 2, 'Grado 1° de Primaria', 2),
(3, 2, 'Grado 2° de Primaria', 3),
(4, 2, 'Grado 3° de Primaria', 4),
(5, 2, 'Grado 4° de Primaria', 5),
(6, 2, 'Grado 5° de Primaria', 6),
(7, 3, 'Grado 6° de Secundaria', 7),
(8, 3, 'Grado 7° de Secundaria', 8),
(9, 3, 'Grado 8° de Secundaria', 9),
(10, 3, 'Grado 9° de Secundaria', 10),
(11, 4, 'Grado 10° (Media)', 11),
(12, 4, 'Grado 11° (Grado de Bachiller)', 12),
(13, 5, 'CLEI 3 y 4 (6° a 9° Acelerado)', 13),
(14, 5, 'CLEI 5 y 6 (10° y 11° Acelerado)', 14)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

-- 3. PAQUETES EDUCATIVOS Y PRECIOS (COP)
CREATE TABLE IF NOT EXISTS paquetes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  grado_id INT DEFAULT NULL,
  descripcion TEXT,
  incluye TEXT,
  precio DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  moneda VARCHAR(5) DEFAULT 'COP',
  periodicidad_pago ENUM('mensual','semestral','anual') DEFAULT 'mensual',
  activo BOOLEAN DEFAULT TRUE,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grado_id) REFERENCES grados(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO paquetes (id, nombre, grado_id, descripcion, incluye, precio, moneda, periodicidad_pago) VALUES
(1, 'Paquete Primaria Virtual 2026', 4, 'Educación 100% virtual sincrónica y asincrónica para primaria', 'Plataforma 24/7, Talleres, Tutorías semanales, Certificación ante MEN', 180000.00, 'COP', 'mensual'),
(2, 'Paquete Secundaria & Bachillerato Virtual', 7, 'Programa académico completo para secundaria y media', 'Acceso a aulas virtuales, Clases en vivo, Preparación Pruebas Saber 11', 220000.00, 'COP', 'mensual'),
(3, 'Paquete CLEI Bachillerato por Ciclos Adultos', 13, 'Estudia tu bachillerato en mitad de tiempo con modelo flexible', 'Módulos autoguiados, Exámenes virtuales, Diploma oficial de Bachiller', 160000.00, 'COP', 'mensual')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), precio=VALUES(precio);

-- 4. REESTRUCTURACIÓN DE LEADS CON CAMPOS AMPLIADOS
CREATE TABLE IF NOT EXISTS leads_fase2 (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  nombre_contacto VARCHAR(100),
  apellido_contacto VARCHAR(100),
  es_acudiente BOOLEAN DEFAULT FALSE,
  nombre_estudiante VARCHAR(100),
  edad_estudiante INT,
  grado_interes_id INT,
  paquete_interes_id INT,
  ciudad VARCHAR(100) DEFAULT 'Colombia',
  departamento VARCHAR(100),
  estado_embudo ENUM('nuevo','contactado','en_proceso','matriculado','descartado') DEFAULT 'nuevo',
  asesor_asignado_id INT,
  notas_internas TEXT,
  habeas_data_aceptado BOOLEAN DEFAULT TRUE,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (grado_interes_id) REFERENCES grados(id) ON DELETE SET NULL,
  FOREIGN KEY (paquete_interes_id) REFERENCES paquetes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrar leads antiguos si existen
INSERT IGNORE INTO leads_fase2 (telefono, nombre_contacto, apellido_contacto, fecha_registro)
SELECT telefono, nombre, apellido, fecha_registro FROM leads;

-- 5. MENSAJES DEL BOT (CON SOPORTE COMPLETO UTF8MB4 PARA EMOJIS)
CREATE TABLE IF NOT EXISTS bot_mensajes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(80) NOT NULL UNIQUE,
  titulo VARCHAR(100),
  contenido TEXT NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forzar la conversión de la tabla a utf8mb4 en caso de haber sido creada previamente con utf8
ALTER TABLE bot_mensajes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO bot_mensajes (clave, titulo, contenido) VALUES
('bienvenida', 'Mensaje de Bienvenida', '¡Hola! Bienvenido al Colegio Virtual Educando para la Vida. Somos una institución educativa 100% virtual.\n\nPara brindarte información personalizada sobre matrículas y programas, ¿cuál es tu **nombre completo**?'),
('habeas_data', 'Aviso de Privacidad (Ley 1581)', 'Al continuar, aceptas nuestra política de tratamiento de datos personales conforme a la Ley 1581 de 2012 de Colombia.'),
('pedir_acudiente', 'Pregunta sobre el Estudiante', '¿El cupo escolar es para ti o eres el acudiente/padre de familia del estudiante?'),
('pedir_grado', 'Selección de Grado', '¿En qué **grado o nivel educativo** están interesados para el año escolar 2026?'),
('confirmacion_lead', 'Confirmación de Registro', '¡Muchas gracias, {nombre}!\n\nHemos registrado tu solicitud para **{grado}**.\n\nUn asesor académico te enviará la malla curricular y los costos por WhatsApp o llamada.\n\n*(Escribe **REINICIAR** en cualquier momento si deseas hacer otra consulta)*')
ON DUPLICATE KEY UPDATE contenido=VALUES(contenido);

-- 6. USUARIOS DEL PANEL ADMINISTRATIVO
CREATE TABLE IF NOT EXISTS usuarios_panel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin','asesor') DEFAULT 'asesor',
  activo BOOLEAN DEFAULT TRUE,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO usuarios_panel (id, nombre, correo, password_hash, rol) VALUES
(1, 'Administrador Colegio', 'admin@educandoparalavida.edu.co', '$2b$10$wE9S.FfWfA9n2w0uN60Z/ed1wE5E0b2Qp7SgE1mS/xKjV4v5e9G.m', 'admin')
ON DUPLICATE KEY UPDATE correo=VALUES(correo);
