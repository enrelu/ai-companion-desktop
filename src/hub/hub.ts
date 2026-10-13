import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { enable as enableAutostart, isEnabled as isAutostartEnabled, disable as disableAutostart } from '@tauri-apps/plugin-autostart';
import { ConfigService, HistoryItem, PinnedItem } from '../services/config';
import { TextTransformers } from '../services/transformers';
import { GeminiService } from '../services/gemini';

// Elementos DOM
const navBtns = document.querySelectorAll<HTMLButtonElement>('.hub-nav-btn');
const tabHistory = document.getElementById('tabHistory') as HTMLElement;
const tabSettings = document.getElementById('tabSettings') as HTMLElement;

const searchInput = document.getElementById('searchInput') as HTMLInputElement;
const pinnedContainer = document.getElementById('pinnedContainer') as HTMLDivElement;
const historyContainer = document.getElementById('historyContainer') as HTMLDivElement;
const clearHistoryBtn = document.getElementById('clearHistoryBtn') as HTMLButtonElement;

const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
const modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
const toneSelect = document.getElementById('toneSelect') as HTMLSelectElement;
const autoReplaceCheck = document.getElementById('autoReplaceCheck') as HTMLInputElement;
const presentationModeCheck = document.getElementById('presentationModeCheck') as HTMLInputElement;
const autostartCheck = document.getElementById('autostartCheck') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const saveStatus = document.getElementById('saveStatus') as HTMLSpanElement;
const checkModelsBtn = document.getElementById('checkModelsBtn') as HTMLButtonElement;
const modelsStatus = document.getElementById('modelsStatus') as HTMLDivElement;

let fullHistory: HistoryItem[] = [];

async function init() {
  await loadSettings();
  await loadHistoryAndPins();

  // Cambio de pestañas
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      navBtns.forEach(b => b.classList.toggle('active', b === btn));
      tabHistory.classList.toggle('active', tab === 'history');
      tabSettings.classList.toggle('active', tab === 'settings');
    });
  });

  // Filtro de búsqueda
  searchInput.addEventListener('input', () => {
    filterAndRenderHistory(searchInput.value.trim().toLowerCase());
  });

  // Limpiar historial
  clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('¿Deseas vaciar el historial de los 20 elementos recientes?')) {
      await ConfigService.clearHistory();
      await loadHistoryAndPins();
    }
  });

  // Guardar configuración
  saveSettingsBtn.addEventListener('click', saveSettings);

  // Comprobar modelos
  checkModelsBtn.addEventListener('click', checkModels);

  // Escuchar cambios de portapapeles emitidos por el watcher de Rust
  await listen<{ text: string }>('clipboard-changed', async (event) => {
    if (event.payload?.text) {
      const config = await ConfigService.getConfig();
      if (!config.presentationMode) {
        await ConfigService.addHistoryItem(event.payload.text);
        await loadHistoryAndPins();
      }
    }
  });

  // Atajos rápidos numéricos 1-4 para pegar pines
  window.addEventListener('keydown', async (e) => {
    if (document.activeElement === searchInput || document.activeElement === apiKeyInput) return;
    const num = parseInt(e.key);
    if (num >= 1 && num <= 4) {
      const config = await ConfigService.getConfig();
      const pin = config.pinnedItems.find(p => p.slot === num);
      if (pin) {
        await copyToClipboard(pin.text);
      }
    }
  });
}

async function loadSettings() {
  const config = await ConfigService.getConfig();
  apiKeyInput.value = config.geminiApiKey;
  modelSelect.value = config.geminiModel;
  toneSelect.value = config.geminiTone;
  autoReplaceCheck.checked = config.autoReplace;
  presentationModeCheck.checked = config.presentationMode;

  try {
    autostartCheck.checked = await isAutostartEnabled();
  } catch (e) {
    console.warn("Autostart check failed:", e);
  }
}

async function saveSettings() {
  await ConfigService.updateConfig({
    geminiApiKey: apiKeyInput.value.trim(),
    geminiModel: modelSelect.value,
    geminiTone: toneSelect.value as any,
    autoReplace: autoReplaceCheck.checked,
    presentationMode: presentationModeCheck.checked
  });

  try {
    if (autostartCheck.checked) {
      await enableAutostart();
    } else {
      await disableAutostart();
    }
  } catch (e) {
    console.warn("Autostart toggle failed:", e);
  }

  saveStatus.style.display = 'inline';
  setTimeout(() => {
    saveStatus.style.display = 'none';
  }, 2000);
}

async function checkModels() {
  modelsStatus.style.display = 'block';
  modelsStatus.textContent = 'Consultando modelos disponibles en Google AI Studio...';
  try {
    const models = await GeminiService.getAvailableModels(apiKeyInput.value.trim());
    if (models.length > 0) {
      modelsStatus.textContent = `Modelos disponibles: ${models.join(', ')}`;
      // Actualizar select si hay nuevos
      const current = modelSelect.value;
      modelSelect.innerHTML = '';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === current) opt.selected = true;
        modelSelect.appendChild(opt);
      });
    } else {
      modelsStatus.textContent = 'No se encontraron modelos compatibles.';
    }
  } catch (err: any) {
    modelsStatus.textContent = `Error: ${err.message}`;
  }
}

async function loadHistoryAndPins() {
  const config = await ConfigService.getConfig();
  fullHistory = await ConfigService.getHistory();

  renderPins(config.pinnedItems);
  filterAndRenderHistory('');
}

function renderPins(pins: PinnedItem[]) {
  pinnedContainer.innerHTML = '';

  for (let slot = 1; slot <= 4; slot++) {
    const pin = pins.find(p => p.slot === slot);
    const card = document.createElement('div');
    card.className = 'hub-pin-card';

    if (pin) {
      card.innerHTML = `
        <div class="hub-pin-header">
          <span>📌 #${slot} ${pin.title}</span>
          <span style="font-size:10.5px; font-weight:700; color:#818cf8; background:rgba(99,102,241,0.18); padding:1px 6px; border-radius:4px;">Alt+${slot}</span>
        </div>
        <div class="hub-pin-text">${escapeHtml(pin.text)}</div>
      `;
      card.addEventListener('click', () => copyToClipboard(pin.text));
    } else {
      card.innerHTML = `
        <div class="hub-pin-header" style="color:var(--text-sub);">
          <span>📌 Slot #${slot} (Vacío)</span>
        </div>
        <div class="hub-pin-text" style="color:var(--text-sub); font-style:italic;">Clic para fijar texto</div>
      `;
      card.addEventListener('click', async () => {
        const text = prompt(`Texto para fijar en el Slot #${slot}:`);
        if (text) {
          const title = prompt(`Nombre identificativo para este Pin:`) || `Pin ${slot}`;
          await ConfigService.setPin(slot, title, text);
          await loadHistoryAndPins();
        }
      });
    }

    pinnedContainer.appendChild(card);
  }
}

function filterAndRenderHistory(query: string) {
  historyContainer.innerHTML = '';

  const filtered = query
    ? fullHistory.filter(item => item.text.toLowerCase().includes(query))
    : fullHistory;

  if (filtered.length === 0) {
    historyContainer.innerHTML = `
      <div class="hub-empty-state">
        ${query ? 'No se encontraron coincidencias para la búsqueda.' : 'El portapapeles está vacío. Copia textos y aparecerán aquí automáticamente (hasta 20).'}
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'hub-item-card';

    const typeIcons = {
      url: '🔗 Enlace',
      email: '📧 Email',
      code: '💻 Código',
      text: '📄 Texto'
    };

    const timeAgo = formatTimeAgo(item.timestamp);

    card.innerHTML = `
      <div class="hub-item-header">
        <span class="hub-item-badge">${typeIcons[item.type] || '📄 Texto'}</span>
        <span class="hub-item-time">${timeAgo}</span>
      </div>
      <div class="hub-item-body">${escapeHtml(item.text)}</div>
      <div class="hub-item-actions">
        <button class="hub-mini-btn btn-copy" title="Copiar al portapapeles">📋 Copiar</button>
        <button class="hub-mini-btn btn-unbreak" title="Unir saltos de línea rotos de PDF">📄 Limpiar PDF</button>
        <button class="hub-mini-btn btn-camel" title="Convertir a camelCase">camelCase</button>
        <button class="hub-mini-btn btn-snake" title="Convertir a snake_case">snake_case</button>
      </div>
    `;

    // Eventos
    const btnCopy = card.querySelector('.btn-copy') as HTMLButtonElement;
    btnCopy.addEventListener('click', () => copyToClipboard(item.text));

    const btnUnbreak = card.querySelector('.btn-unbreak') as HTMLButtonElement;
    btnUnbreak.addEventListener('click', () => {
      const fixed = TextTransformers.unbreakPdfLines(item.text);
      copyToClipboard(fixed);
    });

    const btnCamel = card.querySelector('.btn-camel') as HTMLButtonElement;
    btnCamel.addEventListener('click', () => {
      const converted = TextTransformers.toCamelCase(item.text);
      copyToClipboard(converted);
    });

    const btnSnake = card.querySelector('.btn-snake') as HTMLButtonElement;
    btnSnake.addEventListener('click', () => {
      const converted = TextTransformers.toSnakeCase(item.text);
      copyToClipboard(converted);
    });

    historyContainer.appendChild(card);
  });
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    await invoke('copy_to_clipboard', { text });
  }
}

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Hace un momento';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  return `Hace ${diffHours} h`;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
