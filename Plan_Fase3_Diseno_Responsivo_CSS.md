# PLAN ESTRATÉGICO — FASE 3
## Diseño Responsivo + Sistema de Diseño (CSS) del Aplicativo
### Complemento de los planes de Fase 1 (Bot) y Fase 2 (Panel de Control)

---

## 0. CONTEXTO Y ALCANCE

Este documento cubre **cómo se ve y cómo se comporta visualmente** todo lo construido en las fases anteriores, en cualquier dispositivo:

- El **panel de control administrativo** (Fase 2): dashboard, conversaciones, leads, paquetes/grados, configuración del bot.
- Las **pantallas de autenticación** (login del panel).
- Opcionalmente, una **landing/página informativa** si el colegio quiere un punto de entrada web además del bot (queda planteada como módulo aparte, no obligatoria).

El bot de WhatsApp en sí (Fase 1) no requiere diseño CSS propio —corre dentro de WhatsApp—, pero sí define contenido (textos, listas, botones) que debe sentirse coherente con la identidad visual del panel, para que el colegio perciba un solo producto, no dos herramientas distintas.

**Principio rector de esta fase:** el panel no debe verse como una plantilla administrativa genérica (ese "look" de dashboard gris con azul corporativo que se ve en cualquier SaaS). Va a tener una identidad propia, pensada para un colegio virtual, sin perder profesionalismo ni funcionalidad para trabajo diario intensivo (el equipo de admisiones lo va a usar todo el día).

---

## 1. DIRECCIÓN DE DISEÑO (Sistema de tokens)

### 1.1 Concepto
La identidad visual se inspira en los materiales físicos de un salón de clase —tablero, cuaderno, marcador— llevados a un lenguaje digital limpio y moderno. Esto le da al colegio una personalidad cálida y educativa sin caer en lo infantil, y evita los defaults típicos de IA (crema+terracota, negro+verde neón, o el dashboard SaaS azul/gris genérico).

**Metáfora:** "tablero digital" — fondo claro tipo papel, tipografía con carácter de encabezado tipo tiza/marcador, un azul tablero profundo como color estructural, y un acento cálido (ámbar) que funciona como "el marcador que resalta lo importante" (notificaciones, estados activos, llamadas a la acción).

### 1.2 Paleta de color (tokens)

| Token | Hex | Uso |
|---|---|---|
| `--color-bg` | `#F7F5F1` | Fondo general (papel claro, no blanco puro) |
| `--color-surface` | `#FFFFFF` | Tarjetas, paneles, modales |
| `--color-ink` | `#1E2A38` | Texto principal (azul-tablero muy oscuro, no negro puro) |
| `--color-primary` | `#2C4A6E` | Azul tablero — headers, navegación, botones primarios |
| `--color-primary-dark` | `#1B2F47` | Hover/estados activos del primario |
| `--color-accent` | `#E8A33D` | Ámbar/marcador — CTAs, badges de "nuevo", alertas positivas |
| `--color-success` | `#3E8E5A` | Confirmaciones (matriculado, activo) |
| `--color-warning` | `#D9822B` | Alertas medias (lead sin contactar hace X días) |
| `--color-danger` | `#C0463C` | Errores, descartado, eliminar |
| `--color-border` | `#E2DED5` | Bordes sutiles sobre el fondo papel |
| `--color-muted` | `#6B7686` | Texto secundario, placeholders |

> Nota: estos valores son un punto de partida sólido y accesible (todos los pares texto/fondo cumplen contraste AA). Si el colegio ya tiene un manual de marca o colores institucionales, esta paleta se ajusta directamente reemplazando `--color-primary` y `--color-accent`, manteniendo la misma estructura de tokens.

### 1.3 Tipografía

| Rol | Tipografía sugerida | Uso |
|---|---|---|
| Display (títulos, encabezados de sección) | **Fraunces** (serif con carácter, variable) o **Space Grotesch** si se prefiere algo más geométrico | Títulos de página, nombre de módulos ("Leads", "Paquetes") |
| Cuerpo/UI | **Inter** o **Work Sans** | Texto de tablas, formularios, botones, navegación |
| Datos/monoespaciada | **JetBrains Mono** o **IBM Plex Mono** | Números de teléfono, IDs, timestamps, código de paquete |

**Escala tipográfica (base 16px, ratio 1.25):**
```
--text-xs: 0.75rem;   /* 12px - metadatos, timestamps */
--text-sm: 0.875rem;  /* 14px - texto secundario, labels */
--text-base: 1rem;    /* 16px - cuerpo */
--text-lg: 1.25rem;   /* 20px - subtítulos */
--text-xl: 1.563rem;  /* 25px - títulos de tarjeta */
--text-2xl: 1.953rem; /* 31px - títulos de sección */
--text-3xl: 2.441rem; /* 39px - título de página / dashboard hero */
```

### 1.4 Espaciado y radios (consistencia visual)

```
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;

--radius-sm: 6px;    /* inputs, badges */
--radius-md: 10px;   /* tarjetas, botones */
--radius-lg: 16px;   /* modales, paneles grandes */

--shadow-sm: 0 1px 2px rgba(30,42,56,0.06);
--shadow-md: 0 4px 12px rgba(30,42,56,0.08);
--shadow-lg: 0 12px 32px rgba(30,42,56,0.12);
```

### 1.5 Elemento de firma (signature)
Un detalle recurrente y reconocible: **badges de estado con forma de "etiqueta de cuaderno"** (rectángulo con una muesca sutil en el lado izquierdo, como una pestaña de separador) usados consistentemente para `estado_embudo` de los leads (nuevo, contactado, en proceso, matriculado, descartado) y para el estado del bot (activo/pausado). Es un elemento pequeño pero repetido en todo el panel, que refuerza la metáfora de organización tipo cuaderno/archivador sin ser decorativo porque cumple una función real: comunicar estado de un vistazo.

---

## 2. ARQUITECTURA CSS

### 2.1 Enfoque técnico
- **Tailwind CSS** como base utilitaria (rapidez de desarrollo, coherente con lo que Antigravity genera bien), configurado con los tokens de la sección 1 en `tailwind.config.js` (no colores por defecto de Tailwind, sino la paleta propia).
- **CSS Modules o clases utilitarias propias** solo para componentes con lógica visual compleja (ej. el badge de etiqueta con muesca, gráficos del dashboard).
- **Variables CSS nativas** (`:root { --color-primary: ... }`) como capa base, para que el theming (ej. si el colegio quiere modo oscuro después, o white-label para otro colegio cliente) sea un cambio de variables, no de código.

### 2.2 Estructura de archivos de estilos
```
/src/styles/
  ├── tokens.css        (variables: color, tipografía, espaciado, sombra)
  ├── base.css           (reset, tipografía base, foco de teclado)
  ├── components/
  │   ├── badge.css
  │   ├── card.css
  │   ├── table.css
  │   └── modal.css
  └── tailwind.config.js
```

### 2.3 Reglas de especificidad (evitar conflictos)
- Nunca mezclar selectores por elemento + clase para el mismo componente (ej. evitar `.card` y `div.card` compitiendo). Un componente = una clase raíz.
- Espaciado entre secciones se controla **solo** con utilidades de margen en el contenedor padre (`space-y-*` de Tailwind), nunca con margin individual en cada hijo, para que no haya reglas que se cancelen entre sí.
- Estados (`:hover`, `:focus`, `:disabled`, `.is-active`) siempre definidos junto al componente base, no en un archivo aparte de "estados globales".

---

## 3. DISEÑO RESPONSIVO — ESTRATEGIA GENERAL

### 3.1 Enfoque: Mobile-first
Todo se diseña primero para pantallas pequeñas y se expande hacia arriba con `min-width`, no al revés. Esto es clave porque parte del equipo de admisiones del colegio probablemente va a revisar leads desde el celular entre clases o reuniones.

### 3.2 Breakpoints

| Nombre | Ancho | Dispositivo típico |
|---|---|---|
| `xs` (base, sin prefijo) | 0 – 639px | Celulares |
| `sm` | ≥ 640px | Celulares grandes / phablets en horizontal |
| `md` | ≥ 768px | Tablets verticales |
| `lg` | ≥ 1024px | Tablets horizontales / laptops pequeños |
| `xl` | ≥ 1280px | Laptops / monitores estándar |
| `2xl` | ≥ 1536px | Monitores grandes |

(Estos coinciden con los breakpoints por defecto de Tailwind, por eso se reutilizan tal cual — menos configuración custom, menos errores.)

### 3.3 Patrón de layout por sección del panel

**Navegación principal**
- **Móvil (`xs`–`sm`)**: menú inferior fijo tipo app (íconos: Dashboard, Conversaciones, Leads, Paquetes, Config) o menú hamburguesa superior con drawer lateral. Se recomienda **barra inferior de 5 íconos** porque es más natural en uso con pulgar y evita que el usuario tenga que abrir/cerrar un menú constantemente durante el día.
- **Tablet (`md`)**: sidebar colapsado mostrando solo íconos, expandible con tap.
- **Desktop (`lg`+)**: sidebar fijo expandido con íconos + texto.

**Dashboard / Inicio**
- Móvil: tarjetas de métricas apiladas verticalmente (1 columna), gráfico simplificado o resumido en texto si el espacio no alcanza.
- Tablet: grid de 2 columnas para tarjetas de métricas.
- Desktop: grid de 4 columnas para métricas + gráfico de leads por grado a ancho completo debajo.

**Conversaciones / Mensajes**
- Móvil: vista de **una sola columna a la vez** — primero la lista de conversaciones a pantalla completa; al tocar una, se navega a la vista de chat (patrón tipo WhatsApp/Telegram mobile), con botón "atrás".
- Tablet/Desktop: vista de **dos columnas simultáneas** (lista a la izquierda ~320px fija, conversación abierta ocupando el resto), igual que WhatsApp Web.

**Leads (tabla)**
- Móvil: la tabla se transforma en **tarjetas apiladas** (una tarjeta por lead, con nombre, teléfono, grado y estado visibles; el resto de datos se ve al expandir). Una tabla HTML tradicional no es legible en pantallas de 375px de ancho.
- Tablet: tabla con columnas reducidas (ocultar columnas secundarias como "asesor asignado", visibles solo en desktop).
- Desktop: tabla completa con todas las columnas, filtros en línea horizontal arriba.

**Paquetes y Grados (CRUD)**
- Móvil: formularios de un solo campo por fila, modal a pantalla completa al crear/editar.
- Desktop: modal centrado de ancho fijo (ej. 560px), formulario en 2 columnas si hay muchos campos relacionados (precio + periodicidad en la misma fila, por ejemplo).

**Configuración del bot**
- Editor de texto de cada mensaje del bot: en móvil, un campo por pantalla con vista previa tipo burbuja de WhatsApp debajo; en desktop, lista de mensajes a la izquierda y editor + vista previa a la derecha (dos columnas).

### 3.4 Reglas generales de responsividad (aplican a todo el panel)
- Objetivos táctiles mínimo 44×44px en móvil (botones, íconos de acción en tablas).
- Tipografía nunca por debajo de 14px efectivos en móvil, ni siquiera en metadatos.
- Ningún scroll horizontal accidental: tablas usan scroll horizontal **contenido y explícito** (con indicador visual) solo cuando de verdad no caben, nunca desbordan la página completa.
- Imágenes/gráficos con `max-width: 100%` y unidades relativas, nunca anchos fijos en px para contenedores de layout.
- Modales en móvil ocupan pantalla completa (no modal flotante pequeño), en desktop son centrados con overlay.

---

## 4. ACCESIBILIDAD Y CALIDAD (piso mínimo, no negociable)

- **Contraste**: todos los pares texto/fondo de la paleta cumplen WCAG AA (verificado en la sección 1.2). Revisar especialmente el acento ámbar sobre blanco: usarlo para texto solo en tamaños grandes/bold, o como fondo con texto oscuro encima, no como texto pequeño sobre blanco.
- **Foco de teclado visible**: outline claro (`--color-accent` con offset) en todos los elementos interactivos — importante porque el panel también se puede usar con mouse+teclado en un escritorio de oficina.
- **Reduce motion**: respetar `prefers-reduced-motion` — las animaciones (transiciones de sidebar, aparición de modales) se desactivan o reducen si el sistema operativo del usuario lo pide.
- **Etiquetas de formulario**: cada input con `<label>` asociado real, no solo placeholder (los placeholders desaparecen al escribir y generan errores de accesibilidad y de usabilidad).
- **Estados vacíos con dirección clara**: ej. si no hay leads todavía, el mensaje no es solo "no hay datos", sino algo como "Aún no tienes leads registrados. En cuanto alguien escriba al bot, aparecerá aquí" — información útil, no un vacío mudo.

---

## 5. MÓDULOS DE CONSTRUCCIÓN (para Antigravity, en orden)

| Módulo | Contenido | Depende de |
|---|---|---|
| **M23** | Configurar `tailwind.config.js` con los tokens de color/tipografía/espaciado de la sección 1 | Fase 2 (M16 frontend base) |
| **M24** | Construir `tokens.css` y `base.css` (reset, tipografía base, foco de teclado, `prefers-reduced-motion`) | M23 |
| **M25** | Componentes base reutilizables: botón, input, badge (con la muesca de "etiqueta de cuaderno"), tarjeta, modal — cada uno responsivo desde su primera versión | M23, M24 |
| **M26** | Layout general responsivo: sidebar desktop / barra inferior móvil / drawer tablet | M25 |
| **M27** | Adaptar Dashboard a los 3 breakpoints (grid de métricas) | M26 |
| **M28** | Adaptar Conversaciones al patrón "una columna móvil / dos columnas desktop" | M26 |
| **M29** | Adaptar tabla de Leads al patrón "tarjetas en móvil / tabla en desktop" | M26 |
| **M30** | Adaptar CRUD de Paquetes/Grados y Configuración del bot (modales full-screen en móvil) | M26 |
| **M31** | Auditoría de accesibilidad y pruebas reales en dispositivos (Chrome DevTools + al menos un celular físico Android/iOS) | M27-M30 |

**Recomendación de trabajo con Antigravity:** para cada módulo de UI, pide primero el componente en su versión de escritorio, revísalo, y en un segundo prompt pide explícitamente "ahora hazlo responsivo para móvil siguiendo el patrón X de este módulo" — dividir "construir" de "hacer responsivo" en dos pasos da mejor control de calidad que pedir ambas cosas a la vez.

---

## 6. PRUEBAS DE DISPOSITIVOS (checklist antes de producción)

- [ ] iPhone SE o similar (pantalla pequeña, 375px) — caso más restrictivo.
- [ ] iPhone/Android estándar (390-412px).
- [ ] iPad o tablet Android en vertical y horizontal.
- [ ] Laptop 1366×768 (todavía muy común en oficinas).
- [ ] Monitor desktop 1920×1080.
- [ ] Verificar en Chrome, Safari y al menos un navegador Android (Samsung Internet o Chrome Android).
- [ ] Probar con teclado en pantalla abierto en móvil (que los formularios no queden tapados).
- [ ] Probar orientación horizontal en celular (no debe romper el layout).

---

## 7. RESUMEN DE ENTREGABLES DE ESTA FASE

- Sistema de diseño documentado (tokens de color, tipografía, espaciado, radios, sombras).
- Identidad visual propia del panel, coherente con ser un colegio virtual, sin caer en plantillas genéricas.
- Arquitectura CSS ordenada (Tailwind + tokens + componentes), sin conflictos de especificidad.
- Todas las pantallas del panel (Fase 2) funcionando correctamente en móvil, tablet y escritorio, con patrones de layout específicos por sección.
- Piso de accesibilidad cumplido (contraste, foco de teclado, reduce motion, formularios correctos).
- Checklist de pruebas reales en dispositivos, no solo en el navegador de escritorio.

---

*Este documento se apoya en los planes de Fase 1 (bot) y Fase 2 (panel + modelo académico). Se trabaja con Antigravity en los módulos M23 a M31, después de tener el panel funcional de la Fase 2.*
