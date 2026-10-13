// Configuration and Storage Manager using Tauri Plugin Store
import { LazyStore } from '@tauri-apps/plugin-store';
import { ContentType, TextTransformers } from './transformers';

export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiTone: 'professional' | 'casual' | 'concise';
  autoReplace: boolean;
  presentationMode: boolean; // Pausa las ventanas flotantes mientras se comparte pantalla
  pinnedItems: PinnedItem[];
}

export interface PinnedItem {
  id: string;
  slot: number; // 1, 2, 3, 4
  title: string;
  text: string;
}

export interface HistoryItem {
  id: string;
  text: string;
  type: ContentType;
  timestamp: number;
}

const DEFAULT_CONFIG: AppConfig = {
  geminiApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  geminiTone: 'professional',
  autoReplace: false,
  presentationMode: false,
  pinnedItems: []
};

const store = new LazyStore('settings.json');

export const ConfigService = {
  async getConfig(): Promise<AppConfig> {
    const geminiApiKey = (await store.get<string>('geminiApiKey')) ?? DEFAULT_CONFIG.geminiApiKey;
    const geminiModel = (await store.get<string>('geminiModel')) ?? DEFAULT_CONFIG.geminiModel;
    const geminiTone = (await store.get<'professional' | 'casual' | 'concise'>('geminiTone')) ?? DEFAULT_CONFIG.geminiTone;
    const autoReplace = (await store.get<boolean>('autoReplace')) ?? DEFAULT_CONFIG.autoReplace;
    const presentationMode = (await store.get<boolean>('presentationMode')) ?? DEFAULT_CONFIG.presentationMode;
    const pinnedItems = (await store.get<PinnedItem[]>('pinnedItems')) ?? DEFAULT_CONFIG.pinnedItems;

    return {
      geminiApiKey,
      geminiModel,
      geminiTone,
      autoReplace,
      presentationMode,
      pinnedItems
    };
  },

  async updateConfig(partial: Partial<AppConfig>): Promise<void> {
    for (const [key, value] of Object.entries(partial)) {
      await store.set(key, value);
    }
    await store.save();
  },

  // Gestión de los 20 elementos de historial
  async getHistory(): Promise<HistoryItem[]> {
    const history = (await store.get<HistoryItem[]>('history')) ?? [];
    return history;
  },

  async addHistoryItem(text: string): Promise<HistoryItem[]> {
    const trimmed = text.trim();
    if (!trimmed) return await this.getHistory();

    const currentHistory = await this.getHistory();

    // Evitar duplicados idénticos en la cima
    if (currentHistory.length > 0 && currentHistory[0].text === trimmed) {
      return currentHistory;
    }

    const newItem: HistoryItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      text: trimmed,
      type: TextTransformers.detectContentType(trimmed),
      timestamp: Date.now()
    };

    // Mantener estrictamente un máximo de 20 elementos (FIFO)
    const updated = [newItem, ...currentHistory.filter(item => item.text !== trimmed)].slice(0, 20);

    await store.set('history', updated);
    await store.save();
    return updated;
  },

  async clearHistory(): Promise<void> {
    await store.set('history', []);
    await store.save();
  },

  // Gestión de pines fijos (hasta 4 slots)
  async setPin(slot: number, title: string, text: string): Promise<void> {
    const config = await this.getConfig();
    const filtered = config.pinnedItems.filter(p => p.slot !== slot);
    filtered.push({
      id: 'pin_' + slot,
      slot,
      title: title || `Pin ${slot}`,
      text
    });
    filtered.sort((a, b) => a.slot - b.slot);
    await this.updateConfig({ pinnedItems: filtered });
  },

  async removePin(slot: number): Promise<void> {
    const config = await this.getConfig();
    const filtered = config.pinnedItems.filter(p => p.slot !== slot);
    await this.updateConfig({ pinnedItems: filtered });
  }
};
