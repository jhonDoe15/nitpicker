export const TIME_UNITS = {
  ns: { scale: 1, label: 'nanoseconds' },
  us: { scale: 1e3, label: 'microseconds' },
  ms: { scale: 1e6, label: 'milliseconds' },
  s: { scale: 1e9, label: 'seconds' },
  min: { scale: 6e10, label: 'minutes' },
};

export const UNIT_WORDS = [
  ['Nanoseconds', 'ns'],
  ['Nanos', 'ns'],
  ['Microseconds', 'us'],
  ['Micros', 'us'],
  ['Milliseconds', 'ms'],
  ['Millis', 'ms'],
  ['Ms', 'ms'],
  ['Seconds', 's'],
  ['Secs', 's'],
  ['Minutes', 'min'],
  ['EpochMilli', 'ms'],
  ['EpochSecond', 's'],
];

export const UNIT_CONSTANTS = {
  NANOSECONDS: 'ns',
  NANOS: 'ns',
  MICROSECONDS: 'us',
  MICROS: 'us',
  MILLISECONDS: 'ms',
  MILLIS: 'ms',
  SECONDS: 's',
  MINUTES: 'min',
};

export const CONVERTER_PREFIXES = [
  'of',
  'plus',
  'minus',
  'with',
  'set',
  'from',
  'parse',
  'sleep',
  'truncated',
  'multiplied',
  'divided',
  'is',
  'has',
];

const EPOCH_WORD = /epoch/iu;
const RATIO = /(?:Per|_per|_PER)(?=[A-Z_]|$)/u;
const CAMEL_BOUNDARY = /[a-z0-9]$/u;

function snakeUnit(name, word, unit) {
  const lower = word.toLowerCase();
  const snake = lower.replace(/(?<=[a-z])(?=epoch)|(?<=epoch)(?=[a-z])/u, '_');
  const forms = [`_${snake}`, `_${snake.toUpperCase()}`];
  return forms.some((form) => name.endsWith(form)) ? unit : undefined;
}

function wordUnit(name, word, unit) {
  const bare = name.replace(/^_+/u, '');
  const lowerFirst = `${word[0].toLowerCase()}${word.slice(1)}`;
  if (bare === word.toLowerCase() || bare === word.toUpperCase() || bare === lowerFirst) {
    return unit;
  }
  const head = name.slice(0, -word.length);
  if (name.endsWith(word) && CAMEL_BOUNDARY.test(head)) {
    return unit;
  }
  return snakeUnit(name, word, unit);
}

export function unitOfName(name) {
  if (typeof name !== 'string' || name.length === 0 || RATIO.test(name)) {
    return undefined;
  }
  for (const [word, unit] of UNIT_WORDS) {
    const found = wordUnit(name, word, unit);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function isEpochName(name) {
  return EPOCH_WORD.test(name);
}

function startsWithConverter(name) {
  return CONVERTER_PREFIXES.some(
    (prefix) => name.startsWith(prefix) && !/^[a-z]/u.test(name.slice(prefix.length)),
  );
}

export function unitOfCallName(name) {
  return startsWithConverter(name) ? undefined : unitOfName(name);
}

export function argumentUnitOfCallName(name) {
  return startsWithConverter(name) ? unitOfName(name) : undefined;
}

export function unitOfConstant(name) {
  return UNIT_CONSTANTS[name];
}

export function convertedUnit(unit, factor, operator) {
  if (unit === undefined || !Number.isFinite(factor) || factor <= 0) {
    return undefined;
  }
  const { scale } = TIME_UNITS[unit];
  const target = operator === '*' ? scale / factor : scale * factor;
  return Object.keys(TIME_UNITS).find((key) => TIME_UNITS[key].scale === target);
}

export function unitFactor(left, right) {
  const ratio = TIME_UNITS[left].scale / TIME_UNITS[right].scale;
  return ratio >= 1 ? ratio : 1 / ratio;
}

export function conversionExample(value, from, to) {
  const factor = unitFactor(from, to);
  const operand = /\s/u.test(value) ? `(${value})` : value;
  return TIME_UNITS[from].scale > TIME_UNITS[to].scale
    ? `${operand} * ${factor}`
    : `${operand} / ${factor}`;
}

export function unitLabel(unit) {
  return TIME_UNITS[unit].label;
}
