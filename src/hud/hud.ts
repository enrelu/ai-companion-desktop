import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { GeminiService } from '../services/gemini';
import { Tone } from '../services/prompts';
import { TextTransformers } from '../services/transformers';
import { ConfigService } from '../services/config';

// Estado local
let sourceText = "";
let currentResult = "";
let currentAction = "translate";
let currentTone: Tone = "professional";
let isSpeaking = false;

// Elementos DOM
const hudContent = document.getElementById('hudContent') as HTMLDivElement;
const textStats = document.getElementById('textStats') as HTMLSpanElement;
const statusIndicator = document.getElementById('statusIndicator') as HTMLSpanElement;
const tonesRow = document.getElementById('tonesRow') as HTMLDivElement;
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
const listenBtn = document.getElementById('listenBtn') as HTMLButtonElement;
const explainBtn = document.getElementById('explainBtn') as HTMLButtonElement;
const replaceBtn = document.getElementById('replaceBtn') as HTMLButtonElement;
const closeBtn = document.getElementById('closeBtn') as HTMLButtonElement;
const tabButtons = document.querySelectorAll<HTMLButtonElement>('.hud-tab-btn');
const tonePills = document.querySelectorAll<HTMLButtonElement>('.hud-tone-pill');

// Inicialización
async function init() {
  const config = await ConfigService.getConfig();
  currentTone = config.geminiTone;
  updateTonePillUI();

  // Escuchar evento de invocación desde Rust
  await listen<{ text: string }>('trigger-hud', (event) => {
    handleNewText(event.payload?.text || "");
  });

  // Eventos de tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action && action !== currentAction) {
        currentAction = action;
        tabButtons.forEach(b => b.classList.toggle('active', b === btn));
        tonesRow.style.display = currentAction === 'translate' ? 'flex' : 'none';
        executeCurrentAction();
      }
    });
  });

  // Eventos de tonos
  tonePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const tone = pill.dataset.tone as Tone;
      if (tone && tone !== currentTone) {
        currentTone = tone;
        updateTonePillUI();
        if (currentAction === 'translate') {
          executeCurrentAction();
        }
      }
    });
  });

  // Botón Copiar
  copyBtn.addEventListener('click', async () => {
    if (!currentResult) return;
    try {
      await navigator.clipboard.writeText(currentResult);
      showFeedback(copyBtn, '✅ Copiado');
    } catch {
      await invoke('copy_to_clipboard', { text: currentResult });
      showFeedback(copyBtn, '✅ Copiado');
    }
  });

  // Botón Escuchar (TTS)
  listenBtn.addEventListener('click', () => {
    toggleTTS();
  });

  // Botón Explicar
  explainBtn.addEventListener('click', async () => {
    if (!sourceText) return;
    setLoading("Analizando matices y modismos...");
    try {
      const explanation = await GeminiService.explain(sourceText);
      hudContent.innerHTML = `<div style="color:#a5b4fc; font-weight:600; margin-bottom:4px;">💡 Explicación de contexto:</div><div>${explanation}</div>`;
      currentResult = explanation;
      statusIndicator.textContent = "Explicación lista";
    } catch (e: any) {
      showError(e.message || "Error al generar explicación.");
    }
  });

  // Botón Reemplazar en la app activa
  replaceBtn.addEventListener('click', async () => {
    if (!currentResult) return;
    statusIndicator.textContent = "Reemplazando...";
    try {
      await invoke('replace_text_in_active_app', { text: currentResult });
    } catch (e: any) {
      showError(e.message || "Error al auto-reemplazar.");
    }
  });

  // Botón Cerrar (X)
  closeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    stopTTS();
    await invoke('hide_hud');
  });

  // Ocultar si la ventana pierde el foco (clic fuera en cualquier aplicación)
  window.addEventListener('blur', () => {
    stopTTS();
    invoke('hide_hud');
  });

  // Tecla Esc para cerrar
  window.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      stopTTS();
      await invoke('hide_hud');
    }
  });
}

function handleNewText(text: string) {
  sourceText = text;
  updateStats(text);
  executeCurrentAction();
}

async function executeCurrentAction() {
  if (!sourceText || !sourceText.trim()) {
    hudContent.innerHTML = `
      <div class="hud-loading" style="font-style:normal; color:#a5b4fc; text-align:center; padding: 20px 10px;">
        💡 Selecciona texto en cualquier aplicación y pulsa <strong>Alt+T</strong>.<br>
        <span style="font-size:11.5px; color:#9ca3af; margin-top:8px; display:inline-block;">
          O copia texto y pulsa <strong>Alt+Shift+V</strong> para el historial del portapapeles.
        </span>
      </div>
    `;
    statusIndicator.textContent = "Esperando selección";
    return;
  }

  stopTTS();
  setLoading("Consultando a Gemini...");

  try {
    let result = "";
    switch (currentAction) {
      case 'translate':
        result = await GeminiService.translate(sourceText, currentTone);
        hudContent.textContent = result;
        break;
      case 'makeNative':
        result = await GeminiService.makeNative(sourceText);
        hudContent.textContent = result;
        break;
      case 'smartReply':
        result = await GeminiService.smartReply(sourceText);
        renderSmartReply(result);
        break;
      case 'code':
        result = await GeminiService.explainCodeError(sourceText);
        hudContent.textContent = result;
        break;
      case 'summarize':
        result = await GeminiService.summarize(sourceText);
        hudContent.textContent = result;
        break;
      case 'proofread':
        result = await GeminiService.proofread(sourceText);
        hudContent.textContent = result;
        break;
    }

    currentResult = result;
    statusIndicator.textContent = "Listo";

    // Auto-reemplazo si estuviera configurado
    const config = await ConfigService.getConfig();
    if (config.autoReplace && currentAction === 'translate') {
      await invoke('replace_text_in_active_app', { text: result });
    }
  } catch (err: any) {
    showError(err.message || "Error al procesar la solicitud.");
  }
}

// Renderizado interactivo para Smart Reply
function renderSmartReply(rawOutput: string) {
  const options = rawOutput.split(/Option \d+:/i).map(s => s.trim()).filter(Boolean);
  if (options.length === 0) {
    hudContent.textContent = rawOutput;
    return;
  }

  hudContent.innerHTML = '';
  const labels = ['Opción 1: Positiva / Agradecer', 'Opción 2: Solicitar detalles / Pregunta', 'Opción 3: Alternativa / Declinar'];

  options.forEach((optText, index) => {
    const card = document.createElement('div');
    card.className = `hud-reply-card ${index === 0 ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="hud-reply-label">${labels[index] || `Opción ${index + 1}`}</div>
      <div class="hud-reply-text">${optText}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.hud-reply-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentResult = optText;
      showFeedback(copyBtn, '📋 Copiar Selección');
    });

    hudContent.appendChild(card);
  });

  // Seleccionar la primera opción por defecto
  currentResult = options[0];
}

function setLoading(msg: string) {
  hudContent.innerHTML = `<div class="hud-loading pulsing">${msg}</div>`;
  statusIndicator.textContent = "Procesando...";
}

function showError(msg: string) {
  hudContent.innerHTML = `<div class="hud-error">⚠️ ${msg}</div>`;
  statusIndicator.textContent = "Error";
}

function updateStats(text: string) {
  const stats = TextTransformers.getStats(text);
  textStats.textContent = `${stats.words} palabras • ${stats.chars} caracteres`;
}

function updateTonePillUI() {
  tonePills.forEach(p => {
    p.classList.toggle('active', p.dataset.tone === currentTone);
  });
}

function showFeedback(btn: HTMLButtonElement, tempText: string) {
  const original = btn.textContent;
  btn.textContent = tempText;
  setTimeout(() => {
    btn.textContent = original;
  }, 1400);
}

function toggleTTS() {
  if (isSpeaking) {
    stopTTS();
    return;
  }

  const textToRead = currentResult || sourceText;
  if (!textToRead) return;

  const isSpanish = /[áéíóúñ¿¡]/.test(textToRead) || textToRead.includes(' el ') || textToRead.includes(' de ');
  const utterance = new SpeechSynthesisUtterance(textToRead);
  utterance.lang = isSpanish ? 'es-ES' : 'en-US';

  utterance.onstart = () => {
    isSpeaking = true;
    listenBtn.classList.add('speaking');
    listenBtn.textContent = '⏹ Parar';
  };

  utterance.onend = utterance.onerror = () => {
    stopTTS();
  };

  window.speechSynthesis.speak(utterance);
}

function stopTTS() {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  listenBtn.classList.remove('speaking');
  listenBtn.textContent = '🔊 Escuchar';
}

init();
