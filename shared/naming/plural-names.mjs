const IRREGULAR_PLURALS = new Map([
  ['analysis', ['analyses']],
  ['axis', ['axes']],
  ['child', ['children']],
  ['criterion', ['criteria']],
  ['foot', ['feet']],
  ['index', ['indices', 'indexes']],
  ['leaf', ['leaves']],
  ['life', ['lives']],
  ['man', ['men']],
  ['matrix', ['matrices']],
  ['mouse', ['mice']],
  ['person', ['people']],
  ['tooth', ['teeth']],
  ['vertex', ['vertices']],
  ['woman', ['women']],
]);

const LAST_WORD = /[A-Z]?[a-z]+$/u;
const CONSONANT_Y = /[^aeiou]y$/u;

function capitalized(word) {
  return `${word[0].toUpperCase()}${word.slice(1)}`;
}

function irregularPluralsOf(name) {
  const word = LAST_WORD.exec(name)?.[0];
  if (word === undefined) {
    return [];
  }
  const head = name.slice(0, -word.length);
  const plurals = IRREGULAR_PLURALS.get(word.toLowerCase()) ?? [];
  const upper = word[0] !== word[0].toLowerCase();
  return plurals.map((plural) => `${head}${upper ? capitalized(plural) : plural}`);
}

export function pluralsOf(name) {
  const plurals = [`${name}s`, `${name}es`];
  if (CONSONANT_Y.test(name)) {
    plurals.push(`${name.slice(0, -1)}ies`);
  }
  return [...new Set([...plurals, ...irregularPluralsOf(name)])];
}
