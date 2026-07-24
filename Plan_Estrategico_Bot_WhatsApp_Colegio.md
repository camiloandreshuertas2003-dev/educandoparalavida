# PLAN ESTRATÉGICO MODULAR
## Bot de WhatsApp para Captación de Leads — Colegio
### Guía de construcción para desarrollo con Antigravity

---

## 0. RESUMEN EJECUTIVO

**Objetivo del proyecto:** construir un bot de WhatsApp que atienda automáticamente a personas interesadas en los programas de un colegio, capture sus datos básicos (nombre, apellido, teléfono, programa de interés), los almacene de forma confiable en una base de datos MySQL, y responda al usuario confirmando el registro — todo alojado en un servidor Contabo (VPS propio), usando la API oficial de WhatsApp (Meta Cloud API o proveedor equivalente).

**Stack propuesto:**
- Backend: Node.js (Express) — recomendado por mejor soporte de librerías para WhatsApp Cloud API y por ser lo que Antigravity maneja muy bien para generar rápido.
- Base de datos: MySQL 8.x
- Servidor: VPS Contabo (Ubuntu 22.04/24.04 LTS)
- Mensajería: WhatsApp Business Cloud API (Meta) — ya cuentas con la clave (token)
- Proceso en segundo plano: PM2 (mantiene el bot vivo)
- Proxy/SSL: Nginx + Certbot (HTTPS obligatorio para el webhook de Meta)
- Control de versiones: Git

**Filosofía del plan:** cada módulo es un bloque independiente y verificable. Puedes darle a Antigravity un módulo a la vez como prompt de trabajo, revisar el resultado, y avanzar al siguiente. Esto evita que el agente intente construir "todo de una vez" y se pierda.

---

## 1. ARQUITECTURA GENERAL

```
Usuario WhatsApp
      │
      ▼
Meta WhatsApp Cloud API  ──(webhook POST)──►  Servidor Contabo (Nginx → Node.js/Express)
                                                        │
                                          ┌─────────────┼──────────────┐
                                          ▼              ▼              ▼
                                   Máquina de       Base de datos   Envío de
                                   estados del      MySQL          respuesta
                                   bot (lógica                    (Meta API)
                                   conversacional)
```

**Flujo funcional:**
1. Usuario escribe al número de WhatsApp del colegio.
2. Meta envía el mensaje al webhook (endpoint HTTPS en tu servidor Contabo).
3. El backend identifica en qué "paso" de la conversación está ese usuario (nombre → apellido → teléfono → programa).
4. Pide el siguiente dato o, si ya los tiene todos, guarda el registro completo en MySQL.
5. Responde confirmando el registro al usuario.
6. (Opcional) Notifica al colegio (correo, otro WhatsApp, o dashboard) que hay un lead nuevo.

---

## 2. MÓDULO 1 — Preparación del servidor Contabo

**Objetivo:** dejar el VPS listo para alojar backend + base de datos.

**Tareas:**
1. Crear/acceder al VPS Contabo (mínimo recomendado: 4 GB RAM, 2 vCPU — sobra para este caso de uso).
2. Actualizar el sistema:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
3. Crear un usuario no-root con permisos sudo (evitar trabajar como root).
4. Configurar firewall básico (UFW): abrir solo 22 (SSH), 80, 443.
5. Instalar Node.js LTS (v20+) vía nvm o NodeSource.
6. Instalar MySQL Server 8.x.
7. Instalar Nginx.
8. Instalar Certbot para SSL (Let's Encrypt) — **obligatorio**, Meta exige que el webhook sea HTTPS válido.
9. Instalar PM2 globalmente (`npm i -g pm2`) para mantener el bot corriendo 24/7 y reiniciarlo si falla.
10. Configurar un dominio o subdominio (ej. `bot.tucolegio.com`) apuntando a la IP del VPS.

**Entregable de este módulo:** VPS accesible por SSH, con Node, MySQL, Nginx y SSL funcionando, y un dominio apuntando correctamente.

---

## 3. MÓDULO 2 — Diseño de la base de datos MySQL

**Objetivo:** modelar cómo se guardan los leads y el estado de cada conversación.

**Esquema propuesto (mínimo viable, ampliable):**

```sql
CREATE DATABASE colegio_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE colegio_bot;

-- Tabla de leads (los datos finales capturados)
CREATE TABLE leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  nombre VARCHAR(100),
  apellido VARCHAR(100),
  programa_interes VARCHAR(150),
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  origen VARCHAR(50) DEFAULT 'whatsapp',
  UNIQUE KEY uniq_telefono (telefono)
);

-- Tabla de estado de conversación (para saber en qué paso va cada usuario)
CREATE TABLE conversaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  paso_actual ENUM('inicio','nombre','apellido','telefono','programa','finalizado') DEFAULT 'inicio',
  nombre_temp VARCHAR(100),
  apellido_temp VARCHAR(100),
  programa_temp VARCHAR(150),
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de log de mensajes (opcional, muy recomendable para auditoría/soporte)
CREATE TABLE mensajes_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  direccion ENUM('entrante','saliente') NOT NULL,
  contenido TEXT,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Notas de diseño:**
- Se usa `telefono` como identificador único de la conversación (así el bot "recuerda" en qué paso va cada persona, incluso si se cae el servidor y vuelve a levantar).
- `conversaciones` es una tabla temporal de trabajo; cuando el flujo termina, se copian los datos a `leads` y se puede limpiar o marcar como `finalizado`.
- `mensajes_log` te sirve para auditoría, soporte al cliente (el colegio) y para poder mostrarle reportes.
- Considera desde ya campos para: `sede`, `nivel_educativo`, `fecha_nacimiento_estudiante`, si el colegio los pedirá en una fase 2.

**Entregable de este módulo:** script `schema.sql` ejecutado en el servidor, base de datos creada y accesible con un usuario MySQL dedicado (no usar root para la app).

---

## 4. MÓDULO 3 — Integración con WhatsApp Business Cloud API

**Objetivo:** conectar tu servidor con Meta para poder recibir y enviar mensajes.

**Tareas:**
1. Verificar que tienes: `WHATSAPP_TOKEN` (token de acceso), `PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, y un `VERIFY_TOKEN` propio (lo inventas tú, se usa para validar el webhook).
2. Crear el endpoint de verificación del webhook (Meta hace un `GET` para validar):
   ```
   GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
   ```
3. Crear el endpoint que recibe mensajes entrantes (`POST /webhook`).
4. Configurar en el panel de Meta for Developers la URL del webhook: `https://bot.tucolegio.com/webhook`.
5. Suscribirse al campo `messages`.
6. Crear la función de envío de mensajes (`POST` a `https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages`).
7. Probar con un mensaje de "echo" simple antes de meter lógica de negocio.

**Variables de entorno (`.env`) recomendadas:**
```
WHATSAPP_TOKEN=xxxx
PHONE_NUMBER_ID=xxxx
VERIFY_TOKEN=un_token_secreto_inventado
DB_HOST=localhost
DB_USER=bot_user
DB_PASSWORD=xxxx
DB_NAME=colegio_bot
PORT=3000
```

**Entregable de este módulo:** el bot responde "echo" a cualquier mensaje entrante, confirmando que la conexión Meta ↔ servidor funciona en ambos sentidos.

---

## 5. MÓDULO 4 — Lógica conversacional (máquina de estados)

**Objetivo:** definir el flujo de preguntas y respuestas del bot.

**Flujo sugerido:**

| Paso | Bot pregunta | Guarda en |
|---|---|---|
| inicio | Mensaje de bienvenida + "¿Cuál es tu nombre?" | — |
| nombre | (recibe nombre) → "¿Cuál es tu apellido?" | `nombre_temp` |
| apellido | (recibe apellido) → "¿Cuál es tu número de teléfono de contacto?" | `apellido_temp` |
| telefono | (recibe teléfono) → "¿Qué programa te interesa? (lista de opciones)" | `telefono_temp` o se usa el `wa_id` |
| programa | (recibe programa) → guarda todo en `leads`, responde confirmación | `programa_temp` → INSERT en `leads` |
| finalizado | Si escribe de nuevo, responde algo como "ya tenemos tu información, un asesor te contactará" | — |

**Recomendaciones importantes:**
- Usa el número de WhatsApp (`wa_id`) como teléfono de contacto por defecto, y pregunta "teléfono de contacto" solo si puede ser diferente (ej. el papá escribe pero da el número del interesado). Esto simplifica el flujo si quieres.
- Para "programa de interés", ofrece una lista cerrada (botones/lista interactiva de WhatsApp) en vez de texto libre — reduce errores y es más profesional. La Cloud API soporta **mensajes interactivos tipo lista o botones**.
- Incluye manejo de errores: si el usuario escribe algo inesperado, el bot debe repetir la pregunta amablemente, no romperse.
- Incluye un comando de reinicio (ej. si escribe "reiniciar" o "cancelar", se borra el estado y empieza de nuevo).
- Define un timeout: si una conversación queda "colgada" más de X horas en un paso intermedio, se puede resetear automáticamente.

**Entregable de este módulo:** documento/diagrama de flujo (puede ser el mismo cuadro de arriba) + pseudocódigo de la máquina de estados, listo para pasárselo a Antigravity como especificación.

---

## 6. MÓDULO 5 — Backend (API y lógica de negocio)

**Objetivo:** construir el servidor Express que une todo.

**Estructura de carpetas sugerida:**
```
/bot-whatsapp-colegio
  ├── src/
  │   ├── config/
  │   │   └── db.js
  │   ├── controllers/
  │   │   └── webhookController.js
  │   ├── services/
  │   │   ├── whatsappService.js   (enviar mensajes)
  │   │   └── conversationService.js (lógica de estados)
  │   ├── models/
  │   │   ├── Lead.js
  │   │   └── Conversation.js
  │   ├── routes/
  │   │   └── webhookRoutes.js
  │   └── app.js
  ├── .env
  ├── package.json
  └── schema.sql
```

**Componentes clave a construir:**
1. Conexión a MySQL (usar `mysql2/promise` con pool de conexiones, no conexión única).
2. Middleware de validación del webhook (verificar firma de Meta con `X-Hub-Signature-256` para seguridad — opcional pero recomendado).
3. Servicio `whatsappService.js`: funciones `enviarTexto()`, `enviarLista()`, `enviarBotones()`.
4. Servicio `conversationService.js`: función `procesarMensaje(telefono, texto)` que aplica la máquina de estados del Módulo 4.
5. Manejo de logs (guardar cada mensaje entrante/saliente en `mensajes_log`).

**Entregable de este módulo:** backend funcional corriendo localmente/en el VPS, probado con al menos 2-3 conversaciones completas de extremo a extremo.

---

## 7. MÓDULO 6 — Seguridad y buenas prácticas

**Checklist obligatorio antes de producción:**
- [ ] `.env` fuera del control de versiones (`.gitignore`).
- [ ] Usuario MySQL de la app con permisos limitados (solo sobre `colegio_bot`, no root).
- [ ] Verificación de firma del webhook de Meta (evita que cualquiera te mande peticiones falsas a tu endpoint).
- [ ] HTTPS obligatorio (Certbot renovación automática).
- [ ] Firewall (UFW) solo con puertos necesarios abiertos.
- [ ] Rate limiting básico en el endpoint del webhook (evitar abuso).
- [ ] Backups automáticos diarios de la base de datos (`mysqldump` + cron).
- [ ] Manejo de datos personales conforme a normativa de protección de datos (Colombia: **Ley 1581 de 2012 / Habeas Data**) — recomienda incluir un mensaje de consentimiento informado antes de capturar los datos, y que el colegio tenga su política de tratamiento de datos.

**Entregable de este módulo:** checklist firmado/verificado antes de pasar a producción.

---

## 8. MÓDULO 7 — Pruebas (QA)

**Casos de prueba mínimos:**
1. Conversación completa exitosa (feliz camino).
2. Usuario que escribe algo inesperado en medio del flujo.
3. Usuario que ya completó el registro y vuelve a escribir.
4. Dos usuarios distintos escribiendo simultáneamente (verificar que no se mezclen datos).
5. Caída y reinicio del servidor a mitad de conversación (verificar que el estado persiste gracias a MySQL).
6. Números de teléfono con formatos distintos (con/sin +57, espacios, etc.).

**Entregable de este módulo:** tabla de casos de prueba con resultado (pasa/falla) y ajustes realizados.

---

## 9. MÓDULO 8 — Despliegue en producción (Contabo)

**Pasos:**
1. Subir el código al VPS (Git clone o `scp`).
2. Instalar dependencias (`npm install --production`).
3. Configurar `.env` en el servidor (nunca subirlo por Git).
4. Levantar el proceso con PM2:
   ```bash
   pm2 start src/app.js --name bot-colegio
   pm2 save
   pm2 startup
   ```
5. Configurar Nginx como proxy reverso hacia el puerto de Node (ej. 3000 → 443 con SSL).
6. Verificar el webhook en el panel de Meta (debe quedar en verde/verificado).
7. Prueba real: escribir desde un celular al número de WhatsApp del colegio.

**Entregable de este módulo:** aplicativo corriendo en producción, accesible 24/7, con reinicio automático ante caídas (PM2) y ante reinicio del servidor (`pm2 startup`).

---

## 10. MÓDULO 9 — Monitoreo y mantenimiento

**Recomendaciones:**
- `pm2 monit` / `pm2 logs` para revisar el bot en tiempo real.
- Alertas simples: si el bot se cae, PM2 lo reinicia solo, pero es bueno tener un log de errores centralizado.
- Revisión periódica de la tabla `leads` para que el colegio pueda hacer seguimiento comercial (puedes ofrecer después un mini-dashboard o exportar a Excel/Google Sheets).
- Backups automáticos (cron job semanal mínimo, diario ideal).
- Plan de escalamiento: si el colegio crece en volumen de mensajes, evaluar mover a colas (ej. Redis + BullMQ) para no perder mensajes en picos altos.

---

## 11. MÓDULO 10 — Cómo usar este plan con Antigravity

**Estrategia de trabajo recomendada:**
1. No le pegues todo el plan de una vez a Antigravity. Trabaja **módulo por módulo**, en orden: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
2. Para cada módulo, dale como prompt: el objetivo del módulo + las tareas + el esquema/código de ejemplo de este documento, y pídele que genere el código real ajustado a tu estructura de carpetas.
3. Después de cada módulo, prueba tú mismo que funciona (con `curl`, Postman, o un mensaje real de WhatsApp) antes de avanzar al siguiente.
4. Guarda cada avance en Git con commits pequeños y descriptivos, así puedes retroceder si algo se rompe.
5. Cuando pidas ajustes o nuevas funcionalidades (fase 2: dashboard, reportes, múltiples programas, integración con CRM), agrégalas como **módulos nuevos**, no mezcladas dentro de los ya construidos.

**Ejemplo de prompt para Antigravity (Módulo 3):**
> "Con base en el Módulo 3 de mi plan (integración WhatsApp Cloud API), crea en mi proyecto Node.js/Express el endpoint de verificación de webhook (GET) y el endpoint de recepción de mensajes (POST /webhook), usando las variables de entorno WHATSAPP_TOKEN, PHONE_NUMBER_ID y VERIFY_TOKEN. Debe responder con un echo simple del mensaje recibido para poder probarlo."

---

## 12. ROADMAP SUGERIDO (fases)

| Fase | Contenido | Duración estimada |
|---|---|---|
| Fase 1 (MVP) | Módulos 1-8: bot funcional capturando los 4 datos y guardando en MySQL | 1-2 semanas |
| Fase 2 | Mensajes interactivos (listas/botones), múltiples programas, mensajes de bienvenida personalizados | 3-5 días |
| Fase 3 | Dashboard web sencillo para que el colegio vea sus leads sin entrar a la base de datos | 1 semana |
| Fase 4 | Notificaciones automáticas al equipo comercial del colegio (correo o WhatsApp interno) cuando llega un lead nuevo | 2-3 días |
| Fase 5 | Reportes y exportación (Excel/CSV), integración con CRM si el colegio ya usa uno | según necesidad |

---

## 13. RESUMEN DE ENTREGABLES FINALES

Al terminar el plan completo tendrás:
- Servidor Contabo configurado y asegurado.
- Base de datos MySQL con esquema de leads, conversaciones y logs.
- Bot conectado a WhatsApp Cloud API, respondiendo en tiempo real.
- Flujo conversacional que captura nombre, apellido, teléfono y programa de interés.
- Registro persistente y auditable de cada conversación.
- Proceso en producción, con monitoreo, backups y reinicio automático.
- Documentación (este mismo plan) que sirve como referencia para futuras fases o para otro desarrollador.

---

*Este documento está pensado para usarse como guía viva: puedes ir marcando cada módulo como completado y ajustarlo a medida que avanza el desarrollo real con Antigravity.*
