const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[-_\s]+/u;

function wordsOf(name) {
  return name.split(WORD_BREAK).filter((word) => word !== '');
}

function capitalized(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

const CASINGS = {
  camelCase: (words) =>
    words.map((word, index) => (index === 0 ? word.toLowerCase() : capitalized(word))).join(''),
  PascalCase: (words) => words.map(capitalized).join(''),
  UPPER_CASE: (words) => words.map((word) => word.toUpperCase()).join('_'),
  snake_case: (words) => words.map((word) => word.toLowerCase()).join('_'),
  'kebab-case': (words) => words.map((word) => word.toLowerCase()).join('-'),
};

export function inCasing(name, casing) {
  const convert = CASINGS[casing];
  const words = wordsOf(name);
  return convert === undefined || words.length === 0 ? undefined : convert(words);
}
