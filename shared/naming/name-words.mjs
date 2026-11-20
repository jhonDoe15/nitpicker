const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+/u;

export function wordsOf(name) {
  return name
    .split(WORD_BREAK)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}
