// Gemini AI Client Service
import { ConfigService } from './config';
import { Prompts, Tone } from './prompts';

export const GeminiService = {
  async executePrompt(promptText: string, modelOverride?: string): Promise<string> {
    const config = await ConfigService.getConfig();
    if (!config.geminiApiKey) {
      throw new Error("No has configurado tu Gemini API Key. Abre Ajustes para añadirla.");
    }

    const model = (modelOverride || config.geminiModel || 'gemini-1.5-flash').replace('models/', '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: promptText }]
          }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const message = errData?.error?.message || `Error HTTP ${response.status}: ${response.statusText}`;
      throw new Error(message);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      throw new Error("Gemini no devolvió ninguna respuesta.");
    }

    return resultText.trim();
  },

  // 1. Traducir con regla asimétrica + modo diccionario
  async translate(text: string, tone?: Tone): Promise<string> {
    const config = await ConfigService.getConfig();
    const effectiveTone = tone || config.geminiTone || 'professional';
    const prompt = Prompts.translate(text, effectiveTone);
    return await this.executePrompt(prompt);
  },

  // 2. Pulir para sonar nativo (Make it Native)
  async makeNative(text: string): Promise<string> {
    const prompt = Prompts.makeNative(text);
    return await this.executePrompt(prompt);
  },

  // 3. Smart Reply (3 opciones rápidas)
  async smartReply(text: string): Promise<string> {
    const prompt = Prompts.smartReply(text);
    return await this.executePrompt(prompt);
  },

  // 4. Diagnóstico de errores de código
  async explainCodeError(text: string): Promise<string> {
    const prompt = Prompts.explainCodeError(text);
    return await this.executePrompt(prompt);
  },

  // 5. Resumen TL;DR
  async summarize(text: string): Promise<string> {
    const prompt = Prompts.summarize(text);
    return await this.executePrompt(prompt);
  },

  // 6. Corrector gramatical y estilo
  async proofread(text: string): Promise<string> {
    const prompt = Prompts.proofread(text);
    return await this.executePrompt(prompt);
  },

  // 7. Explicar modismos y contexto
  async explain(text: string): Promise<string> {
    const prompt = Prompts.explain(text);
    return await this.executePrompt(prompt);
  },

  // Comprobar modelos disponibles con la API Key actual
  async getAvailableModels(apiKey: string): Promise<string[]> {
    if (!apiKey) throw new Error("Por favor, introduce tu API Key primero.");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || "Error al consultar los modelos.");
    }

    const data = await response.json();
    if (!data.models) return [];

    return data.models
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m: { name: string }) => m.name.replace('models/', ''));
  }
};
