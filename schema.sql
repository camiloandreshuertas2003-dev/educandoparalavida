-- ===================================================
-- Esquema de Base de Datos - Bot WhatsApp Colegio
-- Base de datos: ki11745159_educandoparalavida
-- ===================================================

CREATE DATABASE IF NOT EXISTS ki11745159_educandoparalavida CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ki11745159_educandoparalavida;

-- 1. Tabla de leads capturados (datos finales)
CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  programa_interes VARCHAR(150) NOT NULL,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  origen VARCHAR(50) DEFAULT 'whatsapp',
  UNIQUE KEY uniq_telefono (telefono)
);

-- 2. Tabla de seguimiento de estado conversacional
CREATE TABLE IF NOT EXISTS conversaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  paso_actual ENUM('inicio','nombre','apellido','telefono','programa','finalizado') DEFAULT 'inicio',
  nombre_temp VARCHAR(100) DEFAULT NULL,
  apellido_temp VARCHAR(100) DEFAULT NULL,
  telefono_temp VARCHAR(20) DEFAULT NULL,
  programa_temp VARCHAR(150) DEFAULT NULL,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Tabla de auditoría y log de mensajes
CREATE TABLE IF NOT EXISTS mensajes_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  direccion ENUM('entrante','saliente') NOT NULL,
  contenido TEXT,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
