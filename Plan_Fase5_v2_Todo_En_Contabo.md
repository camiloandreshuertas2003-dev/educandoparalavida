# PLAN ESTRATÉGICO — FASE 5 (v2)
## Todo el Aplicativo en un Solo Hosting: Contabo
### Conexión por QR + Base de datos + Panel, sin depender de Render ni de ningún otro proveedor

---

## 0. PRIMER PASO OBLIGATORIO: CONFIRMAR QUÉ TIPO DE SERVICIO TIENES

La captura que compartiste es un **cPanel de hosting compartido** (marca Dongee, plantilla "jupiter"), no una terminal de VPS. Esto no significa necesariamente que tu Contabo sea así — Contabo vende ambos tipos de producto (VPS con root, y hosting web compartido). Antes de seguir, verifica en 2 minutos:

**Cómo saberlo:**
1. Entra a tu área de cliente de Contabo (https://my.contabo.com) — ahí, en "Servicios" o "Your Services", verás si contrataste un **VPS** (aparece con IP, especificaciones de RAM/CPU, y opción de "Manage" con acceso a consola/SSH) o un **producto de "Web Hosting"** (aparece como plan de hosting, con acceso directo a cPanel, igual al de tu captura).
2. Dentro del cPanel mismo (como el de tu imagen), busca en la sección **"Software"** o **"Avanzado"** si existe un ícono llamado **"Terminal"** (acceso SSH vía navegador) y otro llamado **"Setup Node.js App"**. Si ambos existen, tienes margen de maniobra aunque sea hosting compartido. Si no existen, es un hosting muy limitado (solo PHP/MySQL, sin Node.js) y **no es viable** para este proyecto tal cual — habría que hablar con soporte de Contabo sobre subir de plan.

Como me confirmaste que no estás seguro, este plan cubre **los dos caminos posibles**, para que tomes el que corresponda apenas lo confirmes. Los dos parten de la misma base de datos y el mismo modelo (Fases 1-4); lo único que cambia es **dónde y cómo corre el proceso de conexión con WhatsApp**.

---

## 1. ESCENARIO A — Tienes un VPS de Contabo (acceso root/SSH)

Este es el escenario ideal y el que ya se planeó en detalle en el documento anterior ("Fase 5 — Conexión por Código QR"). Se resume aquí para que quede todo en un solo lugar:

- Todo corre en el mismo VPS: MySQL, backend Node/Express, y el proceso de Baileys (conexión WhatsApp por QR), gestionados con PM2.
- La sesión de WhatsApp se guarda en una carpeta real del disco del VPS, que **no se borra** al reiniciar (a diferencia de Render).
- Es la opción más estable, con menor riesgo de desconexiones y mejor rendimiento (sin latencia de red entre servicios).
- Sigue el plan completo ya entregado: Módulos M46 a M53 del documento "Fase 5 — Conexión QR".

**Si confirmas que tienes esto, no necesitas nada más que retomar ese plan tal cual.** El resto de este documento (secciones 2 a 6) es para el otro escenario.

---

## 2. ESCENARIO B — Tienes hosting compartido con cPanel (como el de tu imagen)

Este escenario es más restrictivo y requiere ajustes reales. Hay que ser honesto sobre las limitaciones antes de construir nada:

### 2.1 Por qué el hosting compartido es más difícil para este caso específico
- Baileys necesita mantener **una conexión permanente y constante** (WebSocket abierto 24/7) con los servidores de WhatsApp. El hosting compartido con cPanel normalmente ejecuta aplicaciones Node.js mediante **Passenger** (a través de "Setup Node.js App"), un sistema pensado para aplicaciones web que responden a peticiones HTTP puntuales — **no** para procesos que deben quedarse escuchando indefinidamente. Passenger puede "dormir" o reciclar la aplicación tras un periodo de inactividad, lo que cortaría la conexión de WhatsApp sin aviso.
- Los planes de hosting compartido suelen tener **límites de procesos y de CPU/RAM por cuenta** (tecnología CloudLinux/LVE), pensados para muchos clientes compartiendo el mismo servidor — un proceso que debe mantenerse vivo constantemente puede chocar con esos límites.
- No siempre hay acceso a `pm2` global ni a instalar paquetes de sistema fuera del propio Node.js.

**Conclusión honesta:** es técnicamente posible intentarlo (a continuación el plan para maximizar la estabilidad dentro de estas limitaciones), pero **no hay garantía de la misma estabilidad que un VPS**. Si después de aplicar todo lo de esta sección la conexión sigue siendo inestable, la recomendación práctica es contratar un **VPS Contabo pequeño** (los planes más económicos son de bajo costo mensual) dedicado *solo* al proceso de WhatsApp, mientras el resto (si quieres) se queda en el hosting compartido. Es una decisión de negocio válida esperar a ver si el hosting compartido alcanza, antes de pagar por más infraestructura.

### 2.2 Qué SÍ funciona a favor en este escenario
- **El sistema de archivos NO es efímero** (a diferencia de Render): lo que se guarda en disco (como la carpeta de sesión de Baileys) persiste entre reinicios de la aplicación. Esto ya elimina la causa raíz más grave del problema anterior.
- MySQL ya está disponible en el mismo panel (lo ves en tu cPanel), así que la conexión entre el bot y la base de datos será **local**, sin latencia de red — otro problema que desaparece.

### 2.3 Requisitos a verificar en el cPanel antes de empezar
- [ ] Existe la sección **"Setup Node.js App"** (a veces aparece como "Node.js Selector") — permite elegir versión de Node y definir el archivo de arranque de la aplicación.
- [ ] Existe **"Terminal"** — acceso a una consola dentro del navegador (no es root, pero permite ejecutar `npm install`, ver logs, y comandos básicos).
- [ ] Existe **"Cron Jobs"** — lo vamos a necesitar para las tareas de mantenimiento (sección 2.5).
- [ ] Revisa el **límite de procesos y memoria** de tu plan (normalmente en "Información del servidor" o consultando a soporte de Contabo) — Baileys + Node.js es liviano (no usa navegador), pero es bueno saber el límite real antes de empezar.

### 2.4 Arquitectura para este escenario

```
Hosting Contabo (cPanel)
  ├── MySQL (ya existe en tu cuenta)
  ├── Aplicación Node.js vía "Setup Node.js App"
  │     ├── Backend Express (API del panel + lógica del bot)
  │     └── Proceso Baileys corriendo DENTRO del mismo proceso Node
  │         (no se puede correr como un servicio de sistema aparte,
  │          como sí se podría con PM2 en un VPS)
  ├── Carpeta de sesión de WhatsApp en el directorio de la app (persistente)
  └── Cron Jobs (mantenimiento y verificación de vida del proceso)
```

**Diferencia clave frente al VPS:** en un VPS, Baileys puede correr como un proceso de sistema independiente gestionado por PM2, separado del backend web. En cPanel, todo debe vivir **dentro de la misma aplicación Node.js** que gestiona Passenger, porque solo se tiene control sobre esa única aplicación registrada en "Setup Node.js App". Esto simplifica el despliegue pero hace más importante que el manejo de reconexión (sección 2.6) sea robusto.

### 2.5 Mitigar el "sueño" de la aplicación (lo más importante de este escenario)
Passenger recicla aplicaciones inactivas. Para reducir el riesgo de que esto corte la conexión de WhatsApp:

1. **Cron job de "keep-alive"**: crear una tarea programada (desde "Cron Jobs" en cPanel) que haga una petición HTTP a un endpoint propio de la aplicación (ej. `GET /health`) **cada 3-5 minutos**. Esto evita que Passenger considere la app "inactiva" y la duerma.
   ```
   */5 * * * * curl -s https://tudominio.com/health > /dev/null
   ```
2. **Endpoint `/health` que además verifica la conexión de WhatsApp**: no solo debe responder "OK" del servidor web, sino consultar el estado real del socket de Baileys y, si está desconectado, intentar reconectar automáticamente (usando la sesión guardada, sin pedir QR de nuevo).
3. **Cron job de verificación diaria más profunda**: una tarea que, una vez al día, registre en un log si la conexión de WhatsApp sigue activa, para poder detectar patrones (ej. "se desconecta siempre de madrugada") y ajustar.
4. **Alerta al colegio**: si tras varios intentos de reconexión automática la sesión no se recupera (ej. porque expiró o se cerró manualmente desde el celular), el sistema debe enviar una notificación (correo, ya que tienes cPanel con email disponible según tu captura) avisando que se necesita volver a escanear el QR desde el panel.

### 2.6 Manejo de reconexión (igual de importante que en el VPS, aquí más crítico)
Se aplica exactamente la misma lógica descrita en el documento anterior (diferenciar `loggedOut` de un corte de red, backoff en los reintentos), pero aquí se vuelve **más crítica** porque los cortes van a ser más frecuentes por las limitaciones de Passenger. El endpoint `/health` del punto anterior debe integrarse directamente con esta lógica de reconexión.

### 2.7 Backup de la sesión (aún más importante aquí)
Dado que el entorno es menos predecible, el backup automático diario de la carpeta de sesión (ya mencionado en el plan anterior) no es opcional en este escenario — es la red de seguridad si Passenger llega a corromper o perder el estado en algún reinicio inesperado.

### 2.8 Guardado en base de datos
Aplican exactamente las mismas causas de error y soluciones descritas en el documento anterior (sección "3.3 — Por qué no guarda los datos como debería"): `try/catch` explícito en cada operación MySQL, `await` correctamente usado, y verificación de que el formato de mensaje de Baileys se está interpretando bien. Nada de esto cambia entre VPS y cPanel — es lógica de la aplicación, no de infraestructura.

---

## 3. TABLA COMPARATIVA RÁPIDA (para decidir con el colegio si hace falta)

| | VPS Contabo (Escenario A) | Hosting cPanel Contabo (Escenario B) |
|---|---|---|
| Estabilidad de la conexión WhatsApp | Alta | Media — depende de mitigar el "sueño" de Passenger |
| Control total del servidor | Sí (root) | No (solo lo que expone cPanel) |
| Costo típico | Un poco más alto que hosting compartido | Ya lo tienes, sin costo adicional si aplica |
| Complejidad de mantenimiento | Requiere gestionar el VPS (actualizaciones, seguridad) | cPanel gestiona gran parte de eso por ti |
| Riesgo de "dormir" el proceso | No aplica (PM2 + proceso de sistema propio) | Real, mitigado con cron de keep-alive |
| Recomendado para | Producción estable, volumen medio-alto | Arranque rápido / presupuesto ajustado, volumen bajo-medio, aceptando el riesgo |

---

## 4. ORDEN DE TRABAJO (aplica a cualquiera de los dos escenarios, con el paso 0 adicional)

| Paso | Qué hacer |
|---|---|
| **0** | Confirmar en my.contabo.com y en el propio cPanel cuál escenario aplica (sección 0) |
| **1** | Si es Escenario A: seguir el plan ya entregado (Módulos M46-M53). Si es Escenario B: continuar con los pasos siguientes. |
| **2** | Configurar "Setup Node.js App" en cPanel: versión de Node, carpeta de la app, archivo de arranque |
| **3** | Instalar dependencias vía Terminal de cPanel (`npm install`) |
| **4** | Levantar Baileys de forma aislada primero (igual que en el plan anterior) y confirmar que la sesión persiste tras un reinicio manual de la app desde cPanel |
| **5** | Crear el endpoint `/health` con verificación y reconexión automática de WhatsApp |
| **6** | Configurar el Cron Job de keep-alive (cada 3-5 min) |
| **7** | Configurar el Cron Job de backup diario de la carpeta de sesión |
| **8** | Confirmar formato de mensajes de Baileys y guardado correcto en MySQL (mismas pruebas que el plan anterior) |
| **9** | Reconectar el flujo completo (Fase 1), panel (Fase 2) e IA/memoria (Fase 4) |
| **10** | Prueba de estrés: dejar la app sin uso 30-60 minutos y confirmar que el cron de keep-alive evitó que se durmiera y la conexión sigue activa |
| **11** | Si tras 1-2 semanas de uso real la conexión sigue siendo inestable a pesar de todo esto, evaluar migrar solo el proceso de WhatsApp a un VPS Contabo económico (Escenario A), manteniendo el resto igual |

---

## 5. MÓDULOS DE CONSTRUCCIÓN — ESCENARIO B (para Antigravity)

| Módulo | Contenido | Depende de |
|---|---|---|
| **M46-B** | Configurar "Setup Node.js App" en cPanel y desplegar el backend base | Confirmar Escenario B |
| **M47-B** | Integrar Baileys dentro de la misma aplicación Node (sesión en carpeta persistente del hosting) | M46-B |
| **M48-B** | Endpoint `/health` con verificación y reconexión automática de WhatsApp | M47-B |
| **M49-B** | Cron Job de keep-alive (cPanel) apuntando a `/health` | M48-B |
| **M50-B** | Cron Job de backup diario de la carpeta de sesión | M47-B |
| **M51-B** | Adaptador de formato de mensaje Baileys + guardado en MySQL con manejo explícito de errores | M47-B |
| **M52-B** | Endpoint del panel para ver/regenerar QR y estado de conexión (igual que M47 del plan anterior) | M48-B, Fase 2 |
| **M53-B** | Reconexión del flujo completo (Fases 1, 2 y 4) sobre esta base | M46-B a M52-B |
| **M54-B** | Prueba de estrés de inactividad prolongada + registro de estabilidad durante 1-2 semanas | M53-B |

---

## 6. RESUMEN DE ENTREGABLES DE ESTA FASE

- Confirmación clara de qué tipo de servicio de Contabo tienes, y por qué eso determina la arquitectura.
- Plan completo para el escenario VPS (ya entregado, Módulos M46-M53).
- Plan completo y realista para el escenario de hosting compartido con cPanel (Módulos M46-B a M54-B), con mitigaciones concretas para su principal limitación (Passenger reciclando el proceso).
- Un criterio claro y objetivo (sección 4, paso 11) para saber cuándo vale la pena subir a un VPS si el hosting compartido no da la estabilidad necesaria.
- Todo el sistema (WhatsApp + base de datos + panel) corriendo dentro de un único proveedor, Contabo, sin depender de Render.

---

*Confirma con my.contabo.com y con los íconos de tu cPanel cuál de los dos escenarios aplica, y seguimos con el módulo correspondiente (M46 si es VPS, o M46-B si es hosting compartido).*
