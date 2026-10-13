import { ConfigService, ModelLimitInfo } from './config';
import { Prompts, Tone } from './prompts';

// Función para validar estrictamente que un modelo es de generación de texto puro y estable
export function isAllowedTextModel(m: { id?: string; name?: string; displayName?: string; description?: string }): boolean {
  const combined = `${m.id || ''} ${m.name || ''} ${m.displayName || ''} ${m.description || ''}`.toLowerCase();

  // Debe pertenecer a la familia Gemini
  if (!combined.includes('gemini')) return false;

  // Excluir modelos de imágenes y nombres clave ("nano banana", "image", "imagen", etc.)
  if (combined.includes('image') || combined.includes('imagen') || combined.includes('banana')) return false;
  if (combined.includes('vision') && combined.includes('1.0')) return false;

  // Excluir modelos preview (versiones no finales / experimentales de prueba)
  if (combined.includes('preview')) return false;

  // Excluir modelos de voz, TTS, Transcribe, Audio, Omni
  if (combined.includes('tts') || combined.includes('audio') || combined.includes('transcribe') || combined.includes('speech') || combined.includes('omni')) return false;

  // Excluir modelos de robótica, computer use, herramientas y embeddings
  if (combined.includes('robotics') || combined.includes('computer-use') || combined.includes('computer use') || combined.includes('customtools')) return false;
  if (combined.includes('tool') || combined.includes('embedding') || combined.includes('aqa') || combined.includes('learnlm')) return false;

  return true;
}

export const GeminiService = {
  async executePrompt(promptText: string, modelOverride?: string): Promise<string> {
    const config = await ConfigService.getConfig();
    if (!config.geminiApiKey) {
      throw new Error("No has configurado tu Gemini API Key. Abre Ajustes (Alt+Shift+V) para añadirla.");
    }
    if (!config.geminiModel && !modelOverride) {
      throw new Error("No has seleccionado un modelo. Abre Ajustes (Alt+Shift+V), pulsa 'Comprobar' y elige uno.");
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

  // Comprobar y obtener sólo modelos de generación de texto con información de cuota y límites
  async getAvailableModels(apiKey: string): Promise<ModelLimitInfo[]> {
    if (!apiKey) throw new Error("Por favor, introduce tu Gemini API Key primero.");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || "Error al consultar los modelos con Google AI Studio.");
    }

    const data = await response.json();
    if (!data.models || !Array.isArray(data.models)) return [];

    // Filtrar estrictamente modelos de texto puros estables (excluyendo imagen, banana, preview, tts, audio, transcribe, robotics, computer-use)
    const textModels = data.models.filter((m: any) => {
      const methods: string[] = m.supportedGenerationMethods || [];
      // 1. Debe admitir generateContent
      if (!methods.includes('generateContent')) return false;
      // 2. Comprobar que sea un modelo de texto permitido
      return isAllowedTextModel(m);
    });

    const enriched: ModelLimitInfo[] = textModels.map((m: any) => {
      const id = (m.name || '').replace('models/', '');
      const lower = id.toLowerCase();
      const displayName = m.displayName || id;

      // Cuotas del nivel gratuito de Google AI Studio (Free Tier)
      let rpm = 15;
      let rpd = 1500;
      let tpm = 1000000;
      let isRecommended = false;

      if (lower.includes('pro')) {
        rpm = 2;
        rpd = 50;
        tpm = 32000;
      } else if (lower.includes('flash-8b')) {
        rpm = 15;
        rpd = 1500;
        tpm = 1000000;
      } else if (lower.includes('flash')) {
        rpm = 15;
        rpd = 1500;
        tpm = 1000000;
        isRecommended = !lower.includes('lite');
      }

      return {
        id,
        displayName,
        rpm,
        rpd,
        tpm,
        inputTokenLimit: m.inputTokenLimit || 1048576,
        outputTokenLimit: m.outputTokenLimit || 8192,
        description: m.description || '',
        isRecommended
      };
    });

    // Ordenar: primero los modelos Flash recomendados por versión, luego Lite, luego Pro
    enriched.sort((a, b) => {
      const getWeight = (id: string) => {
        const lower = id.toLowerCase();
        let base = 0;
        if (lower.includes('flash') && !lower.includes('lite')) {
          base = 300;
        } else if (lower.includes('lite')) {
          base = 200;
        } else if (lower.includes('pro')) {
          base = 100;
        }

        const versionMatch = lower.match(/(\d+(?:\.\d+)?)/);
        if (versionMatch) {
          base += parseFloat(versionMatch[1]) * 10;
        } else if (lower.includes('latest')) {
          base += 95;
        }
        return base;
      };
      return getWeight(b.id) - getWeight(a.id);
    });

    return enriched;
  }
};
