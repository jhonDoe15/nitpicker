const WORDS = /[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/gu;
const PARAMETER_WORDS = { string: 'text', number: 'amount', boolean: 'flag', name: 'target' };

/** The bare name of the function a symbol names: no class, parameters or overload number. */
export function lastWord(symbol) {
  return symbol.replace(/\(.*$/su, '').replace(/#\d+$/u, '').split('.').at(-1);
}

function wordsOf(symbol) {
  return (lastWord(symbol).match(WORDS) ?? []).map((word) => word.toLowerCase());
}

function commonPrefix(left, right) {
  const different = left.findIndex((word, index) => right[index] !== word);
  return left.slice(0, different === -1 ? left.length : different);
}

function commonWords(left, right) {
  const prefix = commonPrefix(left, right);
  return prefix.length > 0
    ? prefix
    : commonPrefix(left.toReversed(), right.toReversed()).toReversed();
}

function cased(words, snake) {
  if (snake) {
    return words.join('_');
  }
  return words
    .map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('');
}

function distinct(candidate, taken) {
  const options = [
    candidate,
    ...Array.from({ length: 98 }, (_, i) => `${candidate}${String(i + 2)}`),
  ];
  return options.find((name) => !taken.has(name)) ?? candidate;
}

/** A name for the extracted function from the names of the two copies, none of `taken`. */
export function sharedName(symbols, { snake, taken = new Set() }) {
  const [left, right] = symbols.map(wordsOf);
  const common = commonWords(left, right);
  const plain = cased(common.length === 0 ? ['shared', ...left] : common, snake);
  const prefixed = cased(['shared', ...(common.length === 0 ? left : common)], snake);
  return distinct(taken.has(plain) ? prefixed : plain, taken);
}

function baseName(parameter) {
  if (parameter.kind === 'type') {
    return 'typeArgument';
  }
  if (parameter.deferred) {
    return parameter.values.every((value) => typeof value !== 'string') ? 'value' : 'expression';
  }
  return PARAMETER_WORDS[parameter.literal] ?? 'value';
}

/** One distinct name for each differing value, numbered when a name repeats or is in `taken`. */
export function parameterNames(parameters, { snake, taken = new Set() }) {
  const bases = parameters.map(baseName);
  const seen = new Map();
  const used = new Set(taken);
  return bases.map((base) => {
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const total = bases.filter((other) => other === base).length;
    const numbered = total === 1 ? base : `${base}${String(count)}`;
    const cased = snake
      ? numbered.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)
      : numbered;
    const name = distinct(cased, used);
    used.add(name);
    return name;
  });
}
