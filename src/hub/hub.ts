import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { enable as enableAutostart, isEnabled as isAutostartEnabled, disable as disableAutostart } from '@tauri-apps/plugin-autostart';
import { ConfigService, HistoryItem, PinnedItem, ModelLimitInfo } from '../services/config';
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
const themeToggleBtn = document.getElementById('themeToggleBtn') as HTMLButtonElement;

const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
const modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
const toneSelect = document.getElementById('toneSelect') as HTMLSelectElement;
const autoReplaceCheck = document.getElementById('autoReplaceCheck') as HTMLInputElement;
const presentationModeCheck = document.getElementById('presentationModeCheck') as HTMLInputElement;
const autostartCheck = document.getElementById('autostartCheck') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const saveStatus = document.getElementById('saveStatus') as HTMLSpanElement;
const checkModelsBtn = document.getElementById('checkModelsBtn') as HTMLButtonElement;
const modelsStatus = document.getElementById('modelsStatus') as HTMLDivElement;
const modelLimitsCard = document.getElementById('modelLimitsCard') as HTMLDivElement;

let fullHistory: HistoryItem[] = [];
let currentAvailableModels: ModelLimitInfo[] = [];

async function init() {
  await loadSettings();
  await loadHistoryAndPins();

  const cfg = await ConfigService.getConfig();
  const initialTheme = ConfigService.applyTheme(cfg.theme);
  updateThemeIcon(initialTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', async () => {
      const currentResolved = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentResolved === 'dark' ? 'light' : 'dark';
      await ConfigService.updateConfig({ theme: newTheme });
      themeSelect.value = newTheme;
      ConfigService.applyTheme(newTheme);
      updateThemeIcon(newTheme);
      await emit('theme-changed', { theme: newTheme });
    });
  }

  themeSelect.addEventListener('change', async () => {
    const selected = themeSelect.value as 'dark' | 'light' | 'system';
    await ConfigService.updateConfig({ theme: selected });
    const applied = ConfigService.applyTheme(selected);
    updateThemeIcon(applied);
    await emit('theme-changed', { theme: selected });
  });

  await listen<{ theme: 'dark' | 'light' | 'system' }>('theme-changed', (event) => {
    if (event.payload?.theme) {
      themeSelect.value = event.payload.theme;
      const applied = ConfigService.applyTheme(event.payload.theme);
      updateThemeIcon(applied);
    }
  });

  // Escuchar cambio en el modelo seleccionado para actualizar límites en vivo
  modelSelect.addEventListener('change', () => {
    renderModelLimits(modelSelect.value);
  });

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
  themeSelect.value = config.theme;
  toneSelect.value = config.geminiTone;
  autoReplaceCheck.checked = config.autoReplace;
  presentationModeCheck.checked = config.presentationMode;

  currentAvailableModels = config.availableModels || [];

  if (currentAvailableModels.length > 0) {
    renderModelOptions(currentAvailableModels, config.geminiModel);
  } else {
    // Sin modelos comprobados aún -> Obligar a pulsar comprobar
    modelSelect.innerHTML = '<option value="" disabled selected>⚠️ Pulsa "Comprobar" para cargar los modelos disponibles...</option>';
    modelLimitsCard.style.display = 'none';
    if (config.geminiApiKey) {
      modelsStatus.style.display = 'block';
      modelsStatus.style.color = 'var(--text-muted)';
      modelsStatus.textContent = 'Pulsa "Comprobar" para cargar los modelos de generación de texto disponibles para tu cuenta.';
    }
  }

  try {
    autostartCheck.checked = await isAutostartEnabled();
  } catch (e) {
    console.warn("Autostart check failed:", e);
  }
}

async function saveSettings() {
  const selectedModel = modelSelect.value;
  if (!selectedModel) {
    modelsStatus.style.display = 'block';
    modelsStatus.style.color = '#ef4444';
    modelsStatus.textContent = '⚠️ Debes pulsar "Comprobar" y seleccionar un modelo de Gemini antes de guardar.';
    return;
  }

  await ConfigService.updateConfig({
    geminiApiKey: apiKeyInput.value.trim(),
    geminiModel: selectedModel,
    availableModels: currentAvailableModels,
    theme: themeSelect.value as any,
    geminiTone: toneSelect.value as any,
    autoReplace: autoReplaceCheck.checked,
    presentationMode: presentationModeCheck.checked
  });

  const applied = ConfigService.applyTheme(themeSelect.value as any);
  updateThemeIcon(applied);
  await emit('theme-changed', { theme: themeSelect.value });

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
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    modelsStatus.style.display = 'block';
    modelsStatus.style.color = '#ef4444';
    modelsStatus.textContent = '⚠️ Introduce tu Gemini API Key antes de comprobar.';
    return;
  }

  checkModelsBtn.disabled = true;
  checkModelsBtn.textContent = '⏳ Consultando...';
  modelsStatus.style.display = 'block';
  modelsStatus.style.color = 'var(--text-muted)';
  modelsStatus.textContent = 'Conectando con Google AI Studio y filtrando modelos de texto...';

  try {
    const models = await GeminiService.getAvailableModels(apiKey);
    if (models.length > 0) {
      currentAvailableModels = models;
      const previousModel = modelSelect.value || (await ConfigService.getConfig()).geminiModel;
      renderModelOptions(models, previousModel);

      // Guardar automáticamente para no perder la configuración entre sesiones
      await ConfigService.updateConfig({
        geminiApiKey: apiKey,
        geminiModel: modelSelect.value,
        availableModels: models
      });

      modelsStatus.style.color = '#10b981';
      modelsStatus.textContent = `✅ ${models.length} modelos de texto listos. Modelo guardado entre sesiones.`;
    } else {
      modelsStatus.style.color = '#ef4444';
      modelsStatus.textContent = 'No se encontraron modelos de texto compatibles para esta API Key.';
    }
  } catch (err: any) {
    modelsStatus.style.color = '#ef4444';
    modelsStatus.textContent = `❌ ${err.message}`;
  } finally {
    checkModelsBtn.disabled = false;
    checkModelsBtn.textContent = '🔍 Comprobar';
  }
}

function renderModelOptions(models: ModelLimitInfo[], selectedModelId?: string) {
  modelSelect.innerHTML = '';
  let foundSelected = false;

  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    const star = m.isRecommended ? ' ⭐ (Recomendado)' : '';
    opt.textContent = `${m.displayName || m.id}${star} [${m.rpm} RPM / ${m.rpd} RPD]`;
    if (selectedModelId && m.id === selectedModelId) {
      opt.selected = true;
      foundSelected = true;
    }
    modelSelect.appendChild(opt);
  });

  if (!foundSelected && models.length > 0) {
    modelSelect.selectedIndex = 0;
  }

  renderModelLimits(modelSelect.value);
}

function renderModelLimits(modelId: string) {
  const model = currentAvailableModels.find(m => m.id === modelId);
  if (!model) {
    modelLimitsCard.style.display = 'none';
    return;
  }

  modelLimitsCard.style.display = 'flex';
  const isPro = model.id.toLowerCase().includes('pro');
  const isFlash = model.id.toLowerCase().includes('flash');

  const inTokensStr = model.inputTokenLimit >= 1000000
    ? `${(model.inputTokenLimit / 1000000).toFixed(1)}M`
    : `${Math.round(model.inputTokenLimit / 1000)}k`;

  const outTokensStr = `${Math.round(model.outputTokenLimit / 1000)}k`;

  let note = '';
  if (isPro) {
    note = '⚠️ <strong>Modelo Pro:</strong> En el nivel gratuito (Free Tier) tiene un límite de <strong>2 RPM</strong> y <strong>50 peticiones/día</strong>. Para respuestas instantáneas y continuas se recomienda Flash.';
  } else if (isFlash) {
    note = '⚡ <strong>Modelo Flash (Recomendado):</strong> Máxima velocidad para atajos en tiempo real. <strong>15 RPM</strong> y hasta <strong>1.500 peticiones/día</strong> gratuitas.';
  } else {
    note = `💡 Modelo de texto con <strong>${model.rpm} RPM</strong> y <strong>${model.rpd} peticiones/día</strong>.`;
  }

  modelLimitsCard.innerHTML = `
    <div class="hub-limits-header">
      <span class="hub-limits-title">⚡ ${escapeHtml(model.displayName || model.id)}</span>
      <span class="hub-limits-tier-badge">Límites Free Tier</span>
    </div>
    <div class="hub-limits-grid">
      <div class="hub-limit-stat">
        <div class="hub-limit-stat-val">${model.rpm} <span style="font-size:10px; font-weight:normal;">RPM</span></div>
        <div class="hub-limit-stat-lbl">Peticiones / Min</div>
      </div>
      <div class="hub-limit-stat">
        <div class="hub-limit-stat-val">${model.rpd.toLocaleString()} <span style="font-size:10px; font-weight:normal;">RPD</span></div>
        <div class="hub-limit-stat-lbl">Peticiones / Día</div>
      </div>
      <div class="hub-limit-stat">
        <div class="hub-limit-stat-val">${inTokensStr} <span style="font-size:10px; font-weight:normal;">tokens</span></div>
        <div class="hub-limit-stat-lbl">Contexto Entrada</div>
      </div>
    </div>
    <div class="hub-limits-details">
      <div>${note}</div>
      <div style="margin-top:5px; font-size:10.5px; opacity:0.85;">
        Salida máx: ${outTokensStr} tokens • TPM: ${(model.tpm / 1000).toLocaleString()}k tokens/min. <em>(En cuentas Pay-as-you-go no aplica el límite de 1.500 RPD).</em>
      </div>
    </div>
  `;
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

function updateThemeIcon(theme: 'dark' | 'light') {
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
    themeToggleBtn.title = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  }
}

init();
