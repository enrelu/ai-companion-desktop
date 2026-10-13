# ⚡ AI Companion Desktop (Powered by Gemini & Tauri 2.0)

Una aplicación de escritorio nativa para Windows, ultraligera y orientada a la máxima productividad con texto, idiomas y portapapeles. Funciona en **todo el sistema operativo** (Word, Slack, navegadores, PDFs, terminales, IDEs, etc.).

Evolución y bifurcación oficial de la extensión de Chrome **AITranslator**.

---

## ✨ Características Principales

### 1. Ventana Flotante Contextual (Floating HUD — `Alt+T`)
Selecciona texto en cualquier ventana activa de Windows y pulsa `Alt+T`. La ventana flotante aparecerá instantáneamente junto al cursor con las siguientes herramientas impulsadas por Gemini:
* 🌐 **Traducción Asimétrica:**
  * **Español $\rightarrow$ Inglés**
  * **Cualquier otro idioma $\rightarrow$ Español**
* 📖 **Modo Diccionario Inteligente:** Si seleccionas 1 o 2 palabras, devuelve definiciones, categoría gramatical y sinónimos directos.
* 🎯 **3 Tonos Contextuales:** Profesional, Casual y Conciso.
* 🇬🇧 **Make it Native (Anti-Spanglish):** Pule redacciones en inglés para que suenen con modismos y naturalidad de un hablante nativo.
* 💬 **Smart Reply:** Analiza el mensaje recibido y genera 3 borradores de respuesta rápida en inglés listos para enviar.
* 🐞 **Diagnóstico de Código y Errores:** Detecta *stack traces* o snippets de código y explica en 2 puntos la causa raíz y la solución recomendada.
* 📝 **Resumen TL;DR:** Extrae 3 viñetas clave de cualquier texto largo.
* ✍️ **Corrector de Gramática y Estilo:** Corrige errores en el idioma original sin traducirlo.
* 🔄 **Auto-reemplazo In Situ:** Opción para sustituir directamente el texto seleccionado con la traducción mediante simulación `Ctrl+V`.
* 🔊 **Text-to-Speech (TTS):** Escucha la pronunciación en español o inglés.
* 📊 **Contador de caracteres y palabras** en vivo.

---

### 2. Gestor Inteligente de Portapapeles (Hub — `Alt+Shift+V`)
Accesible mediante atajo global o desde el icono en la barra de tareas (**System Tray**):
* 📋 **Historial de los últimos 20 elementos:** Búfer circular ligero que registra automáticamente cualquier texto copiado en Windows.
* 📌 **Pines Frecuentes (Slots 1 a 4):** Fija textos habituales (NIF, emails, firmas, prompts) con acceso instantáneo mediante las teclas `1`, `2`, `3` o `4`.
* 🔍 **Búsqueda Instantánea:** Filtrado en tiempo real sobre el historial copiado.
* 🏷️ **Detección de Tipo:** Identifica enlaces (🔗), correos (📧), código (💻) o texto plano (📄).
* 📄 **Limpieza de PDFs (Unbreak Lines):** Une automáticamente saltos de línea rotos típicos de copiar texto desde documentos PDF.
* 🔤 **Transformaciones Rápidas Locales (0 latencia):** Convierte a `camelCase`, `snake_case`, `kebab-case`, `MAYÚSCULAS`, `minúsculas` o `Título`.
* 🛡️ **Modo Oculto / Compartir Pantalla:** Pausa la aparición de popups mientras compartes pantalla en videollamadas.

---

## ⌨️ Atajos Globales de Teclado

| Atajo | Acción |
| :--- | :--- |
| `Alt + T` | Abrir Asistente Flotante con el texto seleccionado |
| `Alt + Shift + V` | Abrir / Ocultar Historial del Portapapeles y Ajustes |
| `1`, `2`, `3`, `4` | Copiar Pin rápido 1, 2, 3 o 4 (en la ventana Hub) |
| `Escape` | Cerrar la ventana flotante |

---

## 🛠️ Requisitos e Instalación

### Requisitos del Sistema
* Windows 10 o Windows 11 (64-bit).
* **Node.js** (v18 o superior).
* **Rust** y **WinLibs MinGW/GCC** (ya configurados en el entorno).

### Puesta en Marcha en Desarrollo
```bash
# 1. Instalar dependencias de frontend
npm install

# 2. Compilar el frontend
npm run build

# 3. Ejecutar en modo desarrollo con Tauri
npm run tauri dev
```

---

## 🔑 Configuración

1. Abre el panel de **Ajustes** en la aplicación (o desde el System Tray $\rightarrow$ *Historial y Ajustes*).
2. Pega tu API Key gratuita de [Google AI Studio](https://aistudio.google.com/).
3. Selecciona tu modelo favorito (`gemini-1.5-flash`, `gemini-2.0-flash` o `gemini-1.5-pro`).
4. Haz clic en **Guardar Ajustes**.
