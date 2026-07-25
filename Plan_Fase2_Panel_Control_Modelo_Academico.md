# PLAN ESTRATÉGICO — FASE 2
## Panel de Control Administrativo + Modelo de Datos Académico
### Complemento del plan del Bot de WhatsApp — Colegio Virtual

---

## 0. CONTEXTO Y OBJETIVO DE ESTA FASE

La Fase 1 (documento anterior) deja el bot capturando datos básicos de contacto y guardándolos en MySQL. Esta Fase 2 agrega lo que el colegio realmente necesita para operar el negocio desde ahí:

1. Un **panel de control (dashboard administrativo)** donde el equipo del colegio pueda:
   - Ver todos los mensajes y conversaciones en curso.
   - Ver los leads/datos capturados, organizados y filtrables.
   - Configurar cómo responde el bot (textos, flujo, mensajes de bienvenida).
   - Administrar los **paquetes de estudio por grado** (crear, editar, activar/desactivar).
2. Un **modelo de datos académico** que represente correctamente la estructura real de un colegio virtual (grados, niveles, paquetes, precios, periodos).

Este documento no reemplaza el anterior: se conecta a la misma base de datos y la amplía.

---

## 1. ANÁLISIS: ¿QUÉ INFORMACIÓN NECESITA ALMACENAR UN COLEGIO (VIRTUAL)?

Antes de diseñar tablas, es útil separar la información en 4 bloques, porque cada uno tiene un ciclo de vida distinto:

### A. Estructura académica (información que casi no cambia)
- **Niveles educativos**: Preescolar, Primaria, Secundaria, Media (bachillerato). En Colombia esto suele mapear a: Preescolar (Prejardín, Jardín, Transición), Primaria (1° a 5°), Secundaria (6° a 9°), Media (10° a 11°).
- **Grados/cursos**: cada grado específico (ej. "3° de Primaria").
- **Áreas/asignaturas** (si aplica, para colegios que venden por materia y no solo por grado completo): Matemáticas, Español, Ciencias, Inglés, etc.
- **Modalidad**: virtual sincrónica, virtual asincrónica, semipresencial (importante si el colegio ofrece variantes).
- **Calendario académico / periodos**: año lectivo, semestres o periodos (I, II, III, IV), fechas de inicio y fin.

### B. Oferta comercial (lo que se vende — tus "paquetes")
- **Paquetes de estudio**: nombre del paquete, grado(s) al que aplica, qué incluye (todas las materias, materiales, plataforma, certificación, tutorías en vivo, etc.), precio, periodicidad de pago (mensual, semestral, anual), vigencia/promoción.
- **Precios y descuentos**: precio base, descuentos por pronto pago, becas, precio por hermano adicional, etc. (muy común en colegios).
- **Métodos de pago aceptados** (aunque el cobro en sí puede no ser parte del bot inicialmente, es dato relevante a futuro).

### C. Personas (estudiantes, acudientes, leads)
- **Leads/prospectos** (lo que ya tienes en Fase 1): nombre, apellido, teléfono, programa de interés.
- **Datos ampliados del prospecto** que normalmente pide un colegio para calificar el interés:
  - Nombre del estudiante (si quien escribe es el acudiente/padre).
  - Edad o fecha de nacimiento del estudiante (para saber a qué grado corresponde).
  - Grado actual o grado al que aspira.
  - Ciudad/país de residencia (relevante en colegios virtuales con alumnos remotos).
  - Nombre del acudiente/padre responsable y su relación con el estudiante.
  - Colegio de procedencia (si viene de otro colegio).
  - Canal de interés (WhatsApp, redes sociales, referido, etc.) — útil para medir efectividad de mercadeo.
- **Una vez matriculado**, un colegio real necesita (para fases posteriores, no necesariamente ahora):
  - Documento de identidad del estudiante y del acudiente.
  - Datos de contacto de emergencia.
  - Información médica relevante (alergias, condiciones especiales) — dato sensible, requiere manejo especial.
  - Historial académico si aplica (notas, certificados).

### D. Interacción y seguimiento comercial (lo que da valor al equipo de ventas del colegio)
- **Historial de conversación** (ya definido en Fase 1: `mensajes_log`).
- **Estado del lead en el embudo comercial**: nuevo → contactado → en proceso de matrícula → matriculado → descartado. Esto es clave para que el equipo humano sepa a quién hacer seguimiento.
- **Asignación**: qué asesor humano está atendiendo ese lead (si el colegio tiene varias personas de admisiones).
- **Notas internas** del asesor sobre cada lead (ej. "la mamá pidió llamada mañana a las 3pm").

**Conclusión del análisis:** el modelo de datos debe separar claramente "estructura académica/comercial" (paquetes, grados) de "personas e interacciones" (leads, mensajes), conectadas por llaves foráneas. Esto es justo lo que se diseña en la siguiente sección.

---

## 2. MODELO DE DATOS AMPLIADO (MySQL)

```sql
-- =========================================================
-- BLOQUE A: ESTRUCTURA ACADÉMICA
-- =========================================================

CREATE TABLE niveles_educativos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL,          -- Preescolar, Primaria, Secundaria, Media
  orden INT DEFAULT 0
);

CREATE TABLE grados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nivel_id INT NOT NULL,
  nombre VARCHAR(50) NOT NULL,          -- "3° de Primaria", "Transición"
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (nivel_id) REFERENCES niveles_educativos(id)
);

-- =========================================================
-- BLOQUE B: OFERTA COMERCIAL (PAQUETES)
-- =========================================================

CREATE TABLE paquetes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,             -- "Paquete Primaria Full 2026"
  grado_id INT,                             -- a qué grado aplica (puede ser NULL si aplica a varios, ver tabla puente)
  descripcion TEXT,
  incluye TEXT,                             -- materias, materiales, tutorías, certificación, etc.
  precio DECIMAL(10,2) NOT NULL,
  periodicidad_pago ENUM('mensual','semestral','anual') DEFAULT 'mensual',
  vigente_desde DATE,
  vigente_hasta DATE,
  activo BOOLEAN DEFAULT TRUE,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grado_id) REFERENCES grados(id)
);

-- Si un paquete aplica a varios grados (ej. "Paquete Bachillerato Completo")
CREATE TABLE paquete_grados (
  paquete_id INT NOT NULL,
  grado_id INT NOT NULL,
  PRIMARY KEY (paquete_id, grado_id),
  FOREIGN KEY (paquete_id) REFERENCES paquetes(id) ON DELETE CASCADE,
  FOREIGN KEY (grado_id) REFERENCES grados(id) ON DELETE CASCADE
);

CREATE TABLE descuentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paquete_id INT NOT NULL,
  nombre VARCHAR(100),                      -- "Pronto pago", "Segundo hermano"
  porcentaje DECIMAL(5,2),
  vigente_desde DATE,
  vigente_hasta DATE,
  FOREIGN KEY (paquete_id) REFERENCES paquetes(id) ON DELETE CASCADE
);

-- =========================================================
-- BLOQUE C: PERSONAS (LEADS AMPLIADOS)
-- =========================================================

CREATE TABLE leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  nombre_contacto VARCHAR(100),             -- quien escribe (puede ser el acudiente)
  apellido_contacto VARCHAR(100),
  nombre_estudiante VARCHAR(100),
  edad_estudiante INT,
  grado_interes_id INT,                     -- FK a grados
  paquete_interes_id INT,                   -- FK a paquetes (si ya se definió)
  ciudad VARCHAR(100),
  pais VARCHAR(100),
  colegio_procedencia VARCHAR(150),
  canal_origen VARCHAR(50) DEFAULT 'whatsapp',
  estado_embudo ENUM('nuevo','contactado','en_proceso','matriculado','descartado') DEFAULT 'nuevo',
  asesor_asignado_id INT,                   -- FK a usuarios (equipo del colegio)
  notas_internas TEXT,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (grado_interes_id) REFERENCES grados(id),
  FOREIGN KEY (paquete_interes_id) REFERENCES paquetes(id)
);

-- =========================================================
-- BLOQUE D: CONVERSACIÓN Y SEGUIMIENTO (igual que Fase 1, referenciado aquí)
-- =========================================================

CREATE TABLE conversaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  paso_actual VARCHAR(50) DEFAULT 'inicio',
  datos_temporales JSON,                    -- flexible: guarda lo que se va capturando paso a paso
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE mensajes_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  direccion ENUM('entrante','saliente') NOT NULL,
  contenido TEXT,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- BLOQUE E: CONFIGURACIÓN DEL BOT (lo que se administra desde el panel)
-- =========================================================

CREATE TABLE bot_mensajes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(80) NOT NULL UNIQUE,        -- "bienvenida", "pedir_nombre", "pedir_grado", "confirmacion_final"
  contenido TEXT NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =========================================================
-- BLOQUE F: USUARIOS DEL PANEL (equipo del colegio)
-- =========================================================

CREATE TABLE usuarios_panel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100),
  correo VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin','asesor') DEFAULT 'asesor',
  activo BOOLEAN DEFAULT TRUE,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Decisión de diseño clave:** en `conversaciones` se usa una columna `JSON` (`datos_temporales`) en vez de una columna por cada dato temporal. Esto es más flexible: si mañana el colegio quiere pedir un dato adicional en el flujo (ej. "ciudad"), no hay que alterar la tabla, solo el flujo del bot.

---

## 3. EL PANEL DE CONTROL (DASHBOARD ADMINISTRATIVO)

### 3.1 ¿Qué es exactamente?
Una aplicación web (separada del bot, pero conectada a la misma base de datos MySQL) donde el equipo del colegio inicia sesión y gestiona todo sin tocar código ni la base de datos directamente.

### 3.2 Secciones del panel

**a) Dashboard / Inicio**
- Resumen: leads nuevos hoy/semana/mes, conversaciones activas, tasa de conversión por embudo.
- Gráfico simple de leads por grado de interés (para saber qué grados generan más demanda).

**b) Conversaciones / Mensajes**
- Vista tipo "bandeja" con la lista de conversaciones (similar a WhatsApp Web).
- Al abrir una conversación: ver el historial completo (`mensajes_log`) y los datos ya capturados.
- Permitir que un asesor humano tome el control manual de una conversación puntual si el bot no puede resolver algo (esto es opcional para una fase posterior, pero es bueno dejarlo planeado).

**c) Leads / Prospectos**
- Tabla filtrable y ordenable: por grado de interés, estado del embudo, fecha, asesor asignado.
- Exportar a Excel/CSV.
- Editar estado del embudo y agregar notas internas.
- Buscar por nombre o teléfono.

**d) Configuración del Bot**
- Editor de los mensajes clave (`bot_mensajes`): bienvenida, cada pregunta del flujo, mensaje de confirmación final — sin tocar código.
- Activar/desactivar el bot temporalmente (ej. fuera de horario, o si quieren pausarlo).
- (Opcional fase posterior) Editor visual del flujo de preguntas, para poder reordenar o agregar pasos.

**e) Paquetes y Grados**
- CRUD de niveles educativos y grados.
- CRUD de paquetes: nombre, grado(s), qué incluye, precio, periodicidad, vigencia, activo/inactivo.
- CRUD de descuentos asociados a paquetes.
- Esta sección es la que alimenta la lista de "programas/grados" que el bot le muestra al usuario en la conversación (así, si el colegio agrega un paquete nuevo desde el panel, el bot lo ofrece automáticamente sin tocar código).

**f) Usuarios del panel**
- Solo el rol `admin` puede crear otros usuarios (asesores) y asignarles permisos.

### 3.3 Stack recomendado para el panel
- **Backend del panel**: mismo servidor Node/Express de la Fase 1, agregando rutas protegidas (`/api/admin/...`) con autenticación JWT.
- **Frontend del panel**: React (con Vite) + Tailwind — Antigravity trabaja muy bien generando este tipo de interfaces rápidamente.
- **Autenticación**: JWT + `bcrypt` para hash de contraseñas. Sesión con expiración razonable (ej. 8 horas).
- **Autorización por rol**: middleware que valida `admin` vs `asesor` (ej. solo admin puede borrar paquetes o crear usuarios).

---

## 4. CÓMO SE CONECTA EL BOT CON LOS PAQUETES (flujo actualizado)

Con este modelo, el paso "¿Qué programa te interesa?" del bot deja de ser una lista fija en el código y pasa a ser dinámico:

1. El bot consulta en tiempo real la tabla `grados` (o `paquetes` activos) y arma la lista/botones de WhatsApp con las opciones vigentes.
2. El usuario selecciona un grado/paquete.
3. Se guarda el `grado_interes_id` (o `paquete_interes_id`) en el lead, no solo un texto libre — esto permite reportes precisos después ("¿cuántos leads por 6° de bachillerato tuvimos este mes?").
4. Si el colegio activa o desactiva un paquete desde el panel, el bot refleja el cambio automáticamente en la siguiente conversación.

---

## 5. MÓDULOS DE CONSTRUCCIÓN (para trabajar con Antigravity, en orden)

| Módulo | Contenido | Depende de |
|---|---|---|
| **M11** | Migración de base de datos: crear las nuevas tablas del Bloque A-F sobre la BD existente de Fase 1 | Fase 1 completa |
| **M12** | Autenticación del panel (usuarios, login, JWT, roles) | M11 |
| **M13** | API REST de administración: endpoints CRUD para grados, paquetes, descuentos | M11, M12 |
| **M14** | API REST de leads y conversaciones: listar, filtrar, editar estado, ver historial de mensajes | M11, M12 |
| **M15** | API REST de configuración del bot: CRUD de `bot_mensajes`, activar/desactivar bot | M11, M12 |
| **M16** | Frontend del panel: login + layout base (menú lateral, dashboard vacío) | M12 |
| **M17** | Frontend: pantalla de Conversaciones/Mensajes | M14, M16 |
| **M18** | Frontend: pantalla de Leads (tabla, filtros, exportar) | M14, M16 |
| **M19** | Frontend: pantalla de Paquetes y Grados (CRUD visual) | M13, M16 |
| **M20** | Frontend: pantalla de Configuración del bot | M15, M16 |
| **M21** | Actualizar el bot (Fase 1) para que consulte dinámicamente `grados`/`paquetes` en vez de lista fija | M13, M21 (bot ya en producción) |
| **M22** | Pruebas integrales: crear un paquete desde el panel → verificar que el bot lo ofrece → un lead lo selecciona → aparece correctamente en la tabla de leads del panel | Todos los anteriores |

**Recomendación de trabajo:** igual que en la Fase 1, dale a Antigravity un módulo a la vez, con el fragmento de esquema SQL y la descripción de endpoints/pantallas correspondiente, y prueba cada uno antes de avanzar.

---

## 6. CONSIDERACIONES ADICIONALES ESPECÍFICAS DE UN COLEGIO

- **Estacionalidad**: los colegios tienen picos de matrícula (fin/inicio de año escolar). El panel de reportes debería poder filtrar por rango de fechas para medir campañas.
- **Multi-sede o multi-jornada**: si el colegio (aunque sea virtual) maneja distintas jornadas o "sedes virtuales" por país/región, conviene dejar el modelo preparado con una tabla `sedes` desde ya, aunque hoy solo exista una.
- **Datos sensibles de menores de edad**: dado que se está registrando información de estudiantes (muchos de ellos menores), es fundamental:
  - Incluir un mensaje de consentimiento informado al iniciar la conversación (aviso de tratamiento de datos, conforme a la Ley 1581 de 2012 en Colombia si aplica).
  - No solicitar por WhatsApp datos sensibles innecesarios (documento de identidad, información médica) — eso debe reservarse para un proceso de matrícula formal fuera del bot, no en la conversación inicial de captación.
- **Idempotencia de leads**: si la misma persona escribe varias veces, el sistema debe actualizar el lead existente (por `telefono`) en vez de duplicarlo — ya contemplado con `UNIQUE KEY` en `telefono`.
- **Reportabilidad para el colegio**: el verdadero valor del panel para el cliente (el colegio) es poder responder preguntas como "¿cuántos interesados en Primaria tuvimos esta semana?" o "¿qué asesor está cerrando más matrículas?" — por eso el modelo separa bien grados, paquetes y estado del embudo.

---

## 7. RESUMEN DE ENTREGABLES DE ESTA FASE

Al completar esta fase tendrás:
- Base de datos ampliada con estructura académica real (niveles, grados, paquetes, descuentos).
- Panel de administración web con login y roles (admin/asesor).
- Gestión visual de conversaciones y leads, con filtros y exportación.
- Gestión visual de paquetes/grados, reflejada automáticamente en las opciones que ofrece el bot.
- Configuración de los textos y comportamiento del bot sin tocar código.
- Un sistema completo: **bot conversacional + base de datos + panel de control**, listo para que el colegio lo opere de forma autónoma.

---

*Este documento se apoya en el plan de Fase 1 (bot base). Úsalo como la siguiente etapa de trabajo con Antigravity, módulo por módulo (M11 a M22).*
