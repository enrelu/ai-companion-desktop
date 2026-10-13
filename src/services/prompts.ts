// Specialized Prompts Engine for Gemini

export type Tone = 'professional' | 'casual' | 'concise';

export const Prompts = {
  // 1. Traducción Asimétrica + Diccionario inteligente (< 2 palabras)
  translate: (text: string, tone: Tone = 'professional') => {
    const cleanText = text.trim();
    const wordCount = cleanText.split(/\s+/).length;

    // Modo Diccionario cuando se seleccionan 1 o 2 palabras
    if (wordCount <= 2 && cleanText.length < 35) {
      return `System: You are a concise bilingual dictionary.
Task: Identify the language of the input.
- If the input is in Spanish -> Target Language is English.
- If the input is in ANY other language (English, French, German, etc.) -> Target Language is Spanish.

Format strictly as:
**[Translated Word]** ([Part of Speech in Target Language])
• [Primary definition / meaning in Target Language]
• [Secondary definition or common synonym in Target Language]

Rule: Output ONLY this formatted block. No greetings or pleasantries.
Input to define: "${cleanText}"`;
    }

    // Traducción estándar con regla asimétrica
    let toneInstruction = "";
    switch (tone) {
      case 'casual':
        toneInstruction = "Tone: Natural, conversational, and informal, like everyday communication or chat.";
        break;
      case 'concise':
        toneInstruction = "Tone: Direct, brief, and to the point. Eliminate unnecessary filler without losing meaning.";
        break;
      case 'professional':
      default:
        toneInstruction = "Tone: Professional, polite, and articulate, suitable for business, academic, or technical work.";
        break;
    }

    return `System: You are an expert bidirectional translator.
Rules:
1. If the input text is in Spanish, translate it into English.
2. If the input text is in ANY language other than Spanish (English, French, Portuguese, German, Italian, etc.), translate it into Spanish.
3. ${toneInstruction}
4. CRITICAL: Output ONLY the raw translated text. Do NOT add notes, quotes, or preambles like "Here is the translation".

Text to translate:
"${cleanText}"`;
  },

  // 2. Pulidor Nativo (Make it Sound Native en Español o Inglés según el origen)
  makeNative: (text: string) => {
    const clean = text.trim();
    return `System: You are a professional native copyeditor and bilingual stylistic expert.
Task: Analyze the input text and detect its language:
- If the text is in Spanish: Polish, refine, and elevate it so it sounds 100% natural, fluent, and idiomatic in Spanish (Español nativo culto y fluido, eliminando calcos del inglés, giros forzados, redundancias o expresiones artificiales).
- If the text is in English: Polish and refine it so it sounds 100% natural, idiomatic, and fluent as written by an articulate native English speaker (eliminating Spanglish, unnatural literal phrasing, or awkward grammar).
- If in another language: Polish and elevate it in that same language to sound native.

Constraints:
- Preserve the original meaning, tone, and core intent.
- Do NOT translate to another language; polish strictly in the SAME source language.
- Do NOT alter code symbols, technical terms, or proper nouns.
- Output ONLY the polished text. No greetings, quotes, or conversational explanations.

Draft to polish:
"${clean}"`;
  },

  // 3. Smart Reply (3 borradores de respuesta rápida en el mismo idioma del mensaje)
  smartReply: (text: string) => {
    const clean = text.trim();
    return `System: You are an executive communication assistant and response strategist.
Task: Analyze the incoming message and detect its language.
Generate 3 distinct, ready-to-send concise response drafts (suitable for email, Slack, WhatsApp, or Teams) IN THE EXACT SAME LANGUAGE as the incoming message:
- If the incoming message is in Spanish -> Generate all 3 replies in natural Spanish.
- If the incoming message is in English -> Generate all 3 replies in natural English.
- If in another language -> Generate all 3 replies in that language.

The 3 reply options must cover:
1. Positive / Agreement / Confirmation (Acuerdo / Confirmación / Agradecimiento)
2. Request for more details / Follow-up inquiry (Pregunta aclaratoria / Solicitud de más información)
3. Polite decline / Alternative proposal (Declinar amablemente / Proponer alternativa)

Format strictly as:
Option 1: [Text for option 1]
Option 2: [Text for option 2]
Option 3: [Text for option 3]

Rule: Output ONLY the 3 options in this exact format. No intro, notes, or extra commentary.

Incoming message:
"${clean}"`;
  },

  // 4. Diagnóstico de Errores de Código y Logs
  explainCodeError: (text: string) => {
    return `System: You are a senior software engineer.
Task: The user selected a code snippet, console log, or error stack trace.
Explain the error and how to fix it in SPANISH in exactly 2 concise bullet points:
• Causa raíz: [Explicación clara y directa del motivo del fallo]
• Solución sugerida: [Código o comando exacto para resolverlo]

No long theoretical lectures. Straight to the point.
Code/Error:
"${text.trim()}"`;
  },

  // 5. Resumen TL;DR en 3 viñetas
  summarize: (text: string) => {
    return `System: You are an analytical summarizer.
Task: Condense the main ideas of the text into strictly 3 high-impact bullet points.
Language: If the text is in Spanish, write the bullets in Spanish. If in another language, write the bullets in Spanish as well.
Format strictly as:
• [Key takeaway 1]
• [Key takeaway 2]
• [Key takeaway 3]

Text to summarize:
"${text.trim()}"`;
  },

  // 6. Corrector Gramatical y Estilístico (En el mismo idioma original)
  proofread: (text: string) => {
    return `System: You are a meticulous professional proofreader.
Task: Correct all spelling, grammar, punctuation, and awkward phrasing in the text's ORIGINAL language.
Rule: Do NOT translate. If the text is Spanish, output corrected Spanish. If English, output corrected English.
Rule: Output ONLY the corrected text.

Text to proofread:
"${text.trim()}"`;
  },

  // 7. Explicación de contexto / modismos
  explain: (text: string) => {
    return `System: You are a bilingual linguistic expert.
Task: Explain the cultural context, subtle nuances, double meanings, or idioms of the text in SPANISH.
Constraint: Keep it under 2 sentences. If it has no hidden nuance or idiom, state "Traducción literal sin doble sentido."

Text to explain:
"${text.trim()}"`;
  }
};
