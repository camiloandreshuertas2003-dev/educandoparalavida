-- MIGRACIÓN FASE 4: CRM Avanzado, Memoria, Base de Conocimiento y NLU Inteligente

-- 1. Tabla de Perfiles de Contacto (Memoria a mediano plazo por usuario)
CREATE TABLE IF NOT EXISTS perfiles_contacto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  lead_id INT NULL,
  resumen_contexto TEXT NULL,
  intereses_detectados JSON NULL,
  ultima_interaccion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  numero_interacciones INT DEFAULT 1,
  preferencia_horario_contacto VARCHAR(50) NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Base de Conocimiento (FAQs y Respuestas Oficiales Editables)
CREATE TABLE IF NOT EXISTS base_conocimiento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoria VARCHAR(80) DEFAULT 'general',
  pregunta_frecuente VARCHAR(255) NOT NULL,
  respuesta_aprobada TEXT NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  actualizado_por INT NULL,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar FAQs iniciales del Colegio Virtual Educando para la Vida
INSERT INTO base_conocimiento (categoria, pregunta_frecuente, respuesta_aprobada) VALUES
('precios', '¿Cuánto cuestan las pensiones y la matrícula?', 'En el Colegio Virtual Educando para la Vida los costos son muy accesibles y adaptados a Colombia. Ofrecemos mensualidades económicas con opción de pago por cuotas. Al registrar sus datos en este WhatsApp, le enviaremos la tarifa exacta del grado de su interés.'),
('metodologia', '¿Las clases son en vivo o grabadas?', 'Ofrecemos un modelo flexible 100% virtual con plataforma 24/7, clases en vivo interactivas y tutorías personalizadas para que el estudiante aprenda a su propio ritmo.'),
('certificacion', '¿El título es oficial y válido ante el Ministerio de Educación (MEN)?', 'Sí, contamos con resolución oficial expedida por la Secretaría de Educación conforme a la Ley 115 de Educación en Colombia. El título de Bachiller obtenido es 100% legal y válido para ingresar a cualquier universidad de Colombia o del exterior.'),
('requisitos', '¿Qué documentos se necesitan para matricularse?', 'Se requiere fotocopia del documento de identidad del estudiante y acudiente, certificado del último año cursado y recibo de pago de matrícula.'),
('horarios', '¿Cuáles son los horarios de atención de admisiones?', 'Nuestro equipo de admisiones atiende de Lunes a Viernes de 8:00 AM a 6:00 PM y Sábados de 8:00 AM a 1:00 PM por este WhatsApp.');

-- 3. Tabla de Configuración de IA y Prompt System Versionado
CREATE TABLE IF NOT EXISTS bot_configuracion_ia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version INT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  activo BOOLEAN DEFAULT FALSE,
  creado_por INT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO bot_configuracion_ia (version, system_prompt, activo) VALUES
(1, 'Eres el asesor virtual oficial del Colegio Virtual Educando para la Vida en Colombia. Tu objetivo es brindar información institucional precisa, seria y amable sobre matrículas, programas educativos y metodologías, respondiendo dudas a partir de la base de conocimiento y motivando al usuario a registrar su nombre y grado de interés.', TRUE);

-- 4. Tabla de Seguimientos Comerciales y Tareas
CREATE TABLE IF NOT EXISTS seguimientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  asesor_id INT NULL,
  tipo ENUM('llamada','mensaje','recordatorio_sistema') DEFAULT 'recordatorio_sistema',
  fecha_programada DATETIME NOT NULL,
  nota TEXT NULL,
  completado BOOLEAN DEFAULT FALSE,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tablas de Etiquetas para Segmentación de Leads
CREATE TABLE IF NOT EXISTS etiquetas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(20) DEFAULT '#2C4A6E'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO etiquetas (nombre, color) VALUES
('Urgente', '#C0463C'),
('Interesado en Beca', '#E8A33D'),
('Padre de Familia', '#2C4A6E'),
('Estudiante Adulto', '#3E8E5A');

CREATE TABLE IF NOT EXISTS lead_etiquetas (
  lead_id INT NOT NULL,
  etiqueta_id INT NOT NULL,
  PRIMARY KEY (lead_id, etiqueta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Historial de Precios y Archivos Adjuntos por Paquete
CREATE TABLE IF NOT EXISTS paquetes_historial_precio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paquete_id INT NOT NULL,
  precio_anterior DECIMAL(10,2),
  precio_nuevo DECIMAL(10,2),
  cambiado_por INT NULL,
  cambiado_en DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paquete_archivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paquete_id INT NOT NULL,
  tipo ENUM('imagen','pdf') NOT NULL,
  url VARCHAR(500) NOT NULL,
  descripcion VARCHAR(150) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Agregar columnas de Lead Scoring y Estado de Publicación (defensivo)
SET @exist_puntaje := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads_fase2' AND COLUMN_NAME = 'puntaje');
SET @sql_puntaje := IF(@exist_puntaje = 0, 'ALTER TABLE leads_fase2 ADD COLUMN puntaje INT DEFAULT 10;', 'SELECT 1;');
PREPARE stmt1 FROM @sql_puntaje;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @exist_estado := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paquetes' AND COLUMN_NAME = 'estado');
SET @sql_estado := IF(@exist_estado = 0, "ALTER TABLE paquetes ADD COLUMN estado ENUM('borrador','publicado','archivado') DEFAULT 'publicado';", 'SELECT 1;');
PREPARE stmt2 FROM @sql_estado;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
