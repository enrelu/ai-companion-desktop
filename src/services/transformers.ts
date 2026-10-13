// Local zero-latency text utilities (No API calls required)

export type ContentType = 'url' | 'email' | 'code' | 'text';

export const TextTransformers = {
  // Arreglar saltos de línea rotos típicos de copiar PDFs
  unbreakPdfLines: (text: string): string => {
    return text
      // Si la línea termina en guion (palabra partida), unir la palabra
      .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
      // Unir líneas continuas que no son párrafos independientes
      .replace(/([^\n])\n([^\n])/g, '$1 $2')
      // Respetar párrafos intencionales (doble salto de línea)
      .replace(/\n\s*\n/g, '\n\n')
      // Normalizar espacios duplicados
      .replace(/[ \t]+/g, ' ')
      .trim();
  },

  // Conversiones de mayúsculas/minúsculas y estilos de programación
  toCamelCase: (str: string): string => {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, c => c.toLowerCase());
  },

  toSnakeCase: (str: string): string => {
    const matched = str.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g);
    return matched ? matched.map(x => x.toLowerCase()).join('_') : str;
  },

  toKebabCase: (str: string): string => {
    const matched = str.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g);
    return matched ? matched.map(x => x.toLowerCase()).join('-') : str;
  },

  toUpperCase: (str: string): string => str.toUpperCase(),

  toLowerCase: (str: string): string => str.toLowerCase(),

  toTitleCase: (str: string): string => {
    return str.replace(/\b\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  },

  // Detector inteligente del tipo de contenido copiado
  detectContentType: (text: string): ContentType => {
    const trimmed = text.trim();
    if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmed)) {
      return 'url';
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return 'email';
    }
    // Heurística para código: llaves, punto y coma, flechas, indentación típica
    if (
      /[{}();=>]/.test(trimmed) &&
      (trimmed.includes('function') ||
        trimmed.includes('const ') ||
        trimmed.includes('let ') ||
        trimmed.includes('import ') ||
        trimmed.includes('class ') ||
        trimmed.includes('def ') ||
        trimmed.includes('public ') ||
        trimmed.includes('return ') ||
        trimmed.includes('fn ') ||
        trimmed.includes('struct '))
    ) {
      return 'code';
    }
    return 'text';
  },

  // Estadísticas del texto (caracteres, palabras, líneas)
  getStats: (text: string) => {
    const trimmed = text.trim();
    return {
      chars: text.length,
      charsNoSpaces: text.replace(/\s/g, '').length,
      words: trimmed.length > 0 ? trimmed.split(/\s+/).length : 0,
      lines: text.length > 0 ? text.split('\n').length : 0
    };
  }
};
