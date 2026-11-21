const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+/u;

export function wordsOf(name: string): string[] {
  return name
    .split(WORD_BREAK)
    .filter((word: string) => word !== '')
    .map((word) => word.toLowerCase());
}

export function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
