# PLAN ESTRATÉGICO — FASE 4
## Bot Inteligente: Flujo Natural, Memoria, Entrenamiento Profesional y CRM Avanzado
### Complemento profundo de la Fase 2 (Panel de Control)

---

## 0. CONTEXTO Y DIAGNÓSTICO

El bot de la Fase 1 funciona con una **máquina de estados rígida**: pregunta un dato, espera exactamente ese dato, pasa al siguiente. Esto es confiable pero tiene límites reales cuando el volumen crece:

- Si el usuario escribe "¿cuánto cuesta el paquete de bachillerato?" en medio del flujo, el bot no sabe qué hacer con eso.
- Si el usuario vuelve a escribir dos semanas después, el bot no "recuerda" que ya habían hablado.
- El equipo de admisiones no tiene forma de mejorar cómo responde el bot sin pedirle a un programador que edite código.
- Todos los leads se ven igual, sin priorización: un lead que respondió en 2 minutos y dio todos sus datos pesa igual que uno que nunca contestó.
- La oferta académica se edita como datos planos (precio, nombre), pero no como una "ficha" completa que el bot pueda usar para responder preguntas reales.

**Objetivo de esta fase:** resolver los cinco puntos anteriores con una arquitectura que sea a la vez **innovadora y práctica** — sin caer en sobre-ingeniería. La idea central es un **modelo híbrido**: se mantiene la máquina de estados de la Fase 1 para lo que debe ser 100% confiable (capturar nombre, teléfono, programa), y se le agrega una **capa de comprensión de lenguaje natural (LLM)** para todo lo que es conversación libre: preguntas, dudas, objeciones, retomar el hilo.

---

## 1. ARQUITECTURA HÍBRIDA: FLUJO GUIADO + COMPRENSIÓN NATURAL

### 1.1 Por qué híbrido y no "todo IA" ni "todo reglas"
- **Todo reglas** (como está hoy): confiable pero rígido, se rompe con cualquier mensaje inesperado.
- **Todo IA libre**: flexible pero riesgoso — puede prometer cosas que el colegio no ofrece, perder el dato crítico de contacto, o divagar.
- **Híbrido**: los datos críticos (nombre, teléfono, programa) se siguen capturando con el flujo estructurado y confiable de la Fase 1. Todo lo demás —preguntas, dudas, "espera no entendí", retomar después de days— lo maneja una capa de lenguaje natural que **conoce la oferta académica real** (vía consulta directa a la base de datos, nunca inventando datos) y que **siempre puede devolver el control al flujo estructurado**.

### 1.2 Cómo se ve en la práctica

```
Mensaje entrante del usuario
         │
         ▼
 ¿Coincide con lo que el flujo estructurado
 está esperando en este paso? (ej. es un
 número de teléfono válido cuando se pidió teléfono)
         │
   ┌─────┴─────┐
   SÍ           NO / mensaje libre
   │             │
   ▼             ▼
Continúa      Capa de comprensión (LLM)
el flujo      con acceso a:
normal        - Base de conocimiento (FAQs, oferta académica)
              - Perfil/memoria del contacto
              - Herramientas: consultar paquetes, consultar precios
                        │
              ┌─────────┴──────────┐
              Responde la duda      Detecta que puede
              y VUELVE a preguntar  retomar el flujo
              el dato pendiente     (ej. ya tiene el dato
                                    que faltaba)
```

**Regla de oro de esta arquitectura:** la capa de lenguaje natural **nunca inventa** precios, cupos, fechas ni promesas. Siempre consulta la base de datos real (tablas `paquetes`, `grados`, `descuentos` de la Fase 2) antes de responder algo factual. Esto se logra dándole "herramientas" (function calling) en vez de dejarla responder de memoria — es el mismo patrón que usan los asistentes de IA serios: la IA decide *qué* consultar, pero los datos vienen siempre de la base de datos, no del modelo.

### 1.3 Motor de lenguaje natural recomendado
Se recomienda usar la **API de Claude (Anthropic)** como motor de esta capa, dado que:
- Soporta **tool use / function calling**, ideal para conectar "consultar paquete X" o "buscar FAQ Y" a la base de datos real.
- Permite fijar un **system prompt** con el tono, límites y personalidad del colegio (ver Módulo 3).
- Es más económico y controlable usarlo solo como "capa de apoyo" (cuando el flujo estructurado no entiende el mensaje) que como motor de toda la conversación — esto controla costos y riesgos.

Esto es una recomendación técnica, no una atadura: la arquitectura (flujo estructurado + capa NLU con herramientas) funciona igual con cualquier proveedor de LLM: se plantea con Claude por integración natural, pero el diseño es intercambiable.

---

## 2. MEMORIA DEL BOT (corto y mediano plazo)

Hoy la "memoria" es solo el paso actual de la conversación (`conversaciones.datos_temporales`). Esto es memoria de **muy corto plazo** y se pierde una vez termina el flujo. Se propone un modelo de memoria en 3 niveles:

### Nivel 1 — Memoria de conversación activa (ya existe, Fase 2)
`conversaciones.datos_temporales` (JSON) — lo que se está capturando ahora mismo.

### Nivel 2 — Perfil de contacto (memoria de mediano plazo, NUEVO)
Un registro por número de teléfono que persiste **más allá de una sola conversación**, para que si la persona vuelve en dos semanas, el bot no empiece de cero.

```sql
CREATE TABLE perfiles_contacto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  lead_id INT,                                -- FK a leads (Fase 2), una vez existe
  resumen_contexto TEXT,                       -- resumen corto, en lenguaje natural, actualizado automáticamente
  intereses_detectados JSON,                   -- ej. ["Bachillerato", "clases en vivo", "precio"]
  ultima_interaccion DATETIME,
  numero_interacciones INT DEFAULT 0,
  preferencia_horario_contacto VARCHAR(50),    -- si el usuario lo menciona ("mejor en las tardes")
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
```

**Cómo se usa en la práctica (y por qué es práctico, no un capricho técnico):** en vez de mandarle al LLM el historial completo de meses de mensajes (caro, lento, innecesario), cada vez que termina una conversación se genera automáticamente un **resumen corto de 2-3 líneas** (`resumen_contexto`) usando el mismo motor de LLM. La próxima vez que esa persona escribe, el bot solo necesita ese resumen + el mensaje nuevo, no todo el historial. Esto es memoria eficiente y realista, no "recordarlo todo para siempre" (que sería caro e innecesario).

### Nivel 3 — Base de conocimiento del colegio (memoria "de la institución", NUEVO)
No es memoria de una persona, sino el conocimiento que el bot puede usar con cualquiera: preguntas frecuentes, políticas, argumentos de venta aprobados por el colegio. Ver Módulo 3.

---

## 3. ENTRENAMIENTO PROFESIONAL DEL BOT

"Entrenar" aquí no significa reprogramar un modelo de IA desde cero (poco práctico y muy costoso para este caso), sino **construir y mantener el contexto que el bot usa para responder bien** — que es como se "entrenan" en la práctica los asistentes basados en LLM para negocio.

### 3.1 Base de conocimiento editable (Knowledge Base)

```sql
CREATE TABLE base_conocimiento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoria VARCHAR(80),                     -- "precios", "metodologia", "horarios", "certificacion"
  pregunta_frecuente VARCHAR(255),           -- "¿Tienen clases en vivo?"
  respuesta_aprobada TEXT NOT NULL,          -- respuesta oficial, redactada por el colegio
  activo BOOLEAN DEFAULT TRUE,
  actualizado_por INT,                       -- FK usuarios_panel
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Desde el panel (Fase 2, sección "Configuración del bot" ampliada), el colegio puede agregar/editar preguntas frecuentes y sus respuestas oficiales **sin tocar código ni depender de un programador**. Esto es "entrenar" al bot de forma práctica: el LLM recibe estas respuestas aprobadas como referencia obligatoria antes de contestar preguntas de ese tipo, evitando que invente información.

### 3.2 System prompt versionado
El "carácter" y reglas del bot (tono, qué puede y no puede prometer, cuándo derivar a un humano) se guardan como configuración editable y **versionada**, no quemada en el código:

```sql
CREATE TABLE bot_configuracion_ia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version INT NOT NULL,
  system_prompt TEXT NOT NULL,
  activo BOOLEAN DEFAULT FALSE,             -- solo una versión activa a la vez
  creado_por INT,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Por qué versionado y no un solo campo editable:** si un cambio en el prompt hace que el bot responda peor, el colegio (o tú) puede volver a la versión anterior con un clic, sin perder el trabajo. Esto es una práctica estándar y de bajo costo que da mucha seguridad operativa.

### 3.3 Ciclo de mejora continua (lo que hace que esto sea "profesional" y no un experimento único)
1. Cada conversación donde interviene la capa de LLM queda registrada con una marca `requirio_ia = true` en `mensajes_log`.
2. El asesor humano, desde el panel, puede marcar una respuesta del bot como **"buena" o "necesita ajuste"** con un botón simple (👍/👎) al revisar la conversación.
3. Las respuestas marcadas como "necesita ajuste" se acumulan en un panel de revisión semanal — de ahí sale material real para ajustar la base de conocimiento o el system prompt (no se ajusta a ciegas, se ajusta con evidencia real de conversaciones).
4. Esto convierte el mantenimiento del bot en una rutina simple de 15-20 minutos semanales del equipo del colegio, no en un proyecto técnico recurrente.

### 3.4 Ejemplos guiados (few-shot) para calibrar el tono
Adicional a la base de conocimiento factual, se guarda un pequeño set de 5-10 conversaciones "ejemplo" (aprobadas por el colegio) que muestran el tono ideal: cómo saluda, cómo maneja una objeción de precio, cómo cierra pidiendo el dato de contacto. Este set se referencia en el prompt para que el bot "hable como el colegio quiere", no con un tono genérico.

---

## 4. GESTIÓN AVANZADA DE PROSPECTOS (CRM real, no solo tabla de datos)

### 4.1 Lead scoring automático
En vez de que todos los leads se vean igual, se calcula un puntaje simple y explicable:

```sql
ALTER TABLE leads ADD COLUMN puntaje INT DEFAULT 0;
```

**Reglas de puntaje (configurables desde el panel, no fijas en código):**
| Señal | Puntos |
|---|---|
| Completó todos los datos del flujo | +30 |
| Respondió en menos de 5 minutos al primer mensaje | +15 |
| Mencionó una fecha concreta de interés ("para el próximo semestre") | +10 |
| Preguntó por precio o formas de pago | +10 |
| No ha respondido en más de 48 horas | −15 |
| Ya fue contactado 3+ veces sin avanzar de estado | −10 |

Esto le permite al equipo de admisiones **ordenar la bandeja de leads por prioridad real**, no por fecha de llegada únicamente.

### 4.2 Seguimientos y recordatorios automáticos
```sql
CREATE TABLE seguimientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  asesor_id INT,
  tipo ENUM('llamada','mensaje','recordatorio_sistema') DEFAULT 'recordatorio_sistema',
  fecha_programada DATETIME NOT NULL,
  nota TEXT,
  completado BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
```
- El sistema crea automáticamente un recordatorio si un lead lleva 24h sin respuesta ("reactivar contacto").
- Importante en WhatsApp: pasadas 24 horas desde el último mensaje del usuario, Meta exige usar una **plantilla de mensaje pre-aprobada** (no un mensaje libre) para reabrir la conversación. Este módulo debe contemplar el uso de **plantillas HSM aprobadas por Meta** (ej. "Hola {{nombre}}, ¿sigues interesado en el programa de {{grado}}? Escríbenos y con gusto te ayudamos") como parte del flujo de reactivación automática.

### 4.3 Segmentación y etiquetas
```sql
CREATE TABLE etiquetas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE,
  color VARCHAR(20)
);

CREATE TABLE lead_etiquetas (
  lead_id INT NOT NULL,
  etiqueta_id INT NOT NULL,
  PRIMARY KEY (lead_id, etiqueta_id),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (etiqueta_id) REFERENCES etiquetas(id) ON DELETE CASCADE
);
```
Etiquetas libres tipo "urgente", "solo cotizando", "referido", "beca solicitada" — el equipo del colegio las crea según necesite, sin depender de cambios en el modelo de datos.

### 4.4 Vista Kanban del embudo (además de la tabla)
Se agrega, en el panel (Fase 2), una vista alternativa a la tabla de leads: columnas por `estado_embudo` (nuevo, contactado, en proceso, matriculado, descartado), con tarjetas arrastrables. Es un complemento visual, no un reemplazo de la tabla — algunos usuarios prefieren tabla para filtrar/exportar, otros prefieren Kanban para gestión diaria.

### 4.5 Asignación automática de asesores
Regla simple de reparto equitativo (round robin) o por especialidad (ej. un asesor especializado en bachillerato, otro en primaria), configurable desde el panel:
```sql
ALTER TABLE usuarios_panel ADD COLUMN especialidad_nivel_id INT NULL;
-- Si se define, los leads de ese nivel se asignan preferentemente a ese asesor
```

---

## 5. OFERTA ACADÉMICA EDITABLE DE FORMA AVANZADA

### 5.1 Estados de publicación
```sql
ALTER TABLE paquetes ADD COLUMN estado ENUM('borrador','publicado','archivado') DEFAULT 'borrador';
```
El colegio puede preparar un paquete nuevo (borrador), revisarlo con calma, y solo cuando lo marca "publicado" el bot empieza a ofrecerlo. Evita errores de mostrar algo a medio configurar.

### 5.2 Historial de precios (transparencia y control)
```sql
CREATE TABLE paquetes_historial_precio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paquete_id INT NOT NULL,
  precio_anterior DECIMAL(10,2),
  precio_nuevo DECIMAL(10,2),
  cambiado_por INT,
  cambiado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paquete_id) REFERENCES paquetes(id)
);
```
Cada vez que se edita el precio de un paquete desde el panel, se guarda automáticamente el cambio — útil para auditoría y para que el colegio sepa cuándo y quién ajustó precios.

### 5.3 Material adjunto por paquete (brochure digital)
```sql
CREATE TABLE paquete_archivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paquete_id INT NOT NULL,
  tipo ENUM('imagen','pdf') NOT NULL,
  url VARCHAR(500) NOT NULL,
  descripcion VARCHAR(150),
  FOREIGN KEY (paquete_id) REFERENCES paquetes(id) ON DELETE CASCADE
);
```
El colegio sube desde el panel una imagen o PDF (ej. "Brochure Bachillerato 2026") por paquete, y el bot puede **enviarlo directamente por WhatsApp** cuando el usuario pregunta por ese programa — mucho más persuasivo que solo texto, y es información 100% controlada por el colegio (no generada por IA).

### 5.4 Comparador de paquetes (valor agregado real)
Cuando un usuario pregunta algo como "¿cuál es la diferencia entre el paquete básico y el completo?", el bot (vía la capa de LLM + consulta a `paquetes`/`incluye`) puede armar una comparación clara en texto, siempre basada en los campos reales `incluye` de cada paquete — no inventada.

---

## 6. RESUMEN DE NUEVAS TABLAS (para migración sobre Fase 2)

| Tabla | Propósito |
|---|---|
| `perfiles_contacto` | Memoria de mediano plazo por contacto |
| `base_conocimiento` | FAQs y respuestas oficiales editables |
| `bot_configuracion_ia` | System prompt versionado |
| `seguimientos` | Recordatorios y tareas de seguimiento comercial |
| `etiquetas` / `lead_etiquetas` | Segmentación libre de leads |
| `paquetes_historial_precio` | Auditoría de cambios de precio |
| `paquete_archivos` | Brochures/imágenes por paquete |
| Columna `leads.puntaje` | Lead scoring |
| Columna `paquetes.estado` | Borrador/publicado/archivado |

---

## 7. MÓDULOS DE CONSTRUCCIÓN (para Antigravity, en orden)

| Módulo | Contenido | Depende de |
|---|---|---|
| **M32** | Migración: crear las tablas nuevas de la sección 6 | Fase 2 completa |
| **M33** | Integración de la API de Claude como capa de comprensión de lenguaje natural (llamada básica, sin herramientas todavía) | M32 |
| **M34** | Definir y conectar las "herramientas" (tools) del LLM: consultar paquetes/grados, consultar base de conocimiento | M33 |
| **M35** | Lógica de enrutamiento híbrido: decidir si el mensaje sigue el flujo estructurado o pasa a la capa de LLM | M34 |
| **M36** | Generación automática de `resumen_contexto` al cerrar/pausar una conversación (memoria de mediano plazo) | M32, M33 |
| **M37** | Panel: sección de Base de Conocimiento (CRUD de FAQs) | M32 |
| **M38** | Panel: editor de `bot_configuracion_ia` con versionado y botón "activar esta versión" | M32 |
| **M39** | Panel: marcar respuestas del bot como 👍/👎 sobre conversaciones reales | M35 |
| **M40** | Lead scoring: cálculo automático + reglas configurables desde el panel | M32 |
| **M41** | Seguimientos automáticos + integración de plantillas HSM de Meta para reactivar conversaciones tras 24h | M32 |
| **M42** | Panel: etiquetas y vista Kanban del embudo | M32 |
| **M43** | Panel: estados de publicación de paquetes (borrador/publicado/archivado) + historial de precios | M32 |
| **M44** | Panel: carga de archivos/brochures por paquete + envío desde el bot | M32, M34 |
| **M45** | Pruebas integrales del flujo híbrido: mensajes libres, retomar conversación después de días, comparación de paquetes, envío de brochure | M32-M44 |

---

## 8. PRACTICIDAD Y CONTROL DE COSTOS (importante, para que esto no se vuelva sobre-ingeniería)

- La capa de LLM **no reemplaza** el flujo estructurado; solo se activa cuando el mensaje no encaja en lo que el flujo espera. Esto mantiene el costo de uso de la API bajo (la mayoría de mensajes del flujo básico —nombre, teléfono, selección de programa— no consumen LLM).
- Se recomienda un **límite configurable de llamadas al LLM por conversación** (ej. máximo 6), pasado el cual el bot deriva automáticamente a un asesor humano con el mensaje "en un momento un asesor te ayuda personalmente" — evita loops costosos o conversaciones que se salen de control.
- Todo lo "entrenable" (base de conocimiento, system prompt, ejemplos) vive en la base de datos, editable desde el panel — no requiere reentrenar ni re-desplegar código para mejorar el bot.
- Se recomienda partir con las funciones más simples de esta fase (base de conocimiento + memoria de perfil + lead scoring) antes que la comparación de paquetes y brochures, que son valor agregado pero no crítico.

---

## 9. ROADMAP SUGERIDO DE ESTA FASE

| Etapa | Contenido | Prioridad |
|---|---|---|
| 4.1 | M32-M35: capa híbrida funcionando (lo más importante y de mayor impacto) | Alta |
| 4.2 | M36-M39: memoria de contacto + base de conocimiento + versionado + feedback | Alta |
| 4.3 | M40-M42: lead scoring + seguimientos + Kanban | Media |
| 4.4 | M43-M44: oferta académica avanzada (borrador/publicado, brochures) | Media |
| 4.5 | M45: pruebas integrales y ajuste fino | Alta (antes de lanzar) |

---

## 10. RESUMEN DE ENTREGABLES DE ESTA FASE

- Bot capaz de mantener conversación natural sin perder la confiabilidad del flujo de captura de datos.
- Memoria de mediano plazo por contacto (resúmenes automáticos, no historial completo pesado).
- Base de conocimiento y system prompt **editables y versionados** por el propio colegio, sin depender de un programador para "reentrenar" al bot.
- Ciclo de mejora continua simple (feedback 👍/👎 sobre conversaciones reales).
- CRM real para el equipo de admisiones: scoring, seguimientos automáticos, etiquetas, vista Kanban, asignación de asesores.
- Oferta académica con control de versiones, historial de precios y material adjunto que el bot puede enviar directamente.

---

*Este documento se apoya en los planes de Fase 1 (bot base), Fase 2 (panel + modelo académico) y Fase 3 (diseño). Se trabaja con Antigravity en los módulos M32 a M45, priorizando primero la capa híbrida (sección 8) antes de las funciones de valor agregado.*
