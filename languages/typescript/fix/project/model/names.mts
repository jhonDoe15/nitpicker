const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[-_\s]+/u;

function wordsOf(name: string): string[] {
  return name.split(WORD_BREAK).filter((word) => word !== '');
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

const CASINGS: Record<string, ((words: string[]) => string) | undefined> = {
  camelCase: (words: string[]) =>
    words
      .map((word: string, index: number) => (index === 0 ? word.toLowerCase() : capitalized(word)))
      .join(''),
  PascalCase: (words: string[]) => words.map(capitalized).join(''),
  UPPER_CASE: (words: string[]) => words.map((word: string) => word.toUpperCase()).join('_'),
  snake_case: (words: string[]) => words.map((word: string) => word.toLowerCase()).join('_'),
  'kebab-case': (words: string[]) => words.map((word: string) => word.toLowerCase()).join('-'),
};

export function inCasing(name: string, casing: string): string | undefined {
  const convert = CASINGS[casing];
  const words = wordsOf(name);
  return convert === undefined || words.length === 0 ? undefined : convert(words);
}
