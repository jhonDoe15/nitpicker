export type Unit = 'ns' | 'us' | 'ms' | 's' | 'min';

const TIME_UNITS: Readonly<Record<Unit, { scale: number; label: string }>> = {
  ns: { scale: 1, label: 'nanoseconds' },
  us: { scale: 1e3, label: 'microseconds' },
  ms: { scale: 1e6, label: 'milliseconds' },
  s: { scale: 1e9, label: 'seconds' },
  min: { scale: 6e10, label: 'minutes' },
};

export const UNIT_WORDS: readonly (readonly [string, Unit])[] = [
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

const UNIT_CONSTANTS: Readonly<Record<string, Unit>> = {
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
  'format',
];

const EPOCH_WORD = /epoch/iu;
const RATIO = /(?:Per|_per|_PER)(?=[A-Z_]|$)/u;
const FLAG = /^_*(?:show|hide|include|display|enable|disable|use|should|can|allow)(?=[A-Z_])/u;
const CAMEL_BOUNDARY = /[a-z0-9]$/u;

function snakeUnit(name: string, word: string, unit: Unit): Unit | undefined {
  const lower = word.toLowerCase();
  const snake = lower.replace(/(?<=[a-z])(?=epoch)|(?<=epoch)(?=[a-z])/u, '_');
  const forms = [`_${snake}`, `_${snake.toUpperCase()}`];
  return forms.some((form) => name.endsWith(form)) ? unit : undefined;
}

function wordUnit(name: string, word: string, unit: Unit): Unit | undefined {
  const bare = name.replace(/^_+/u, '');
  const lowerFirst = `${word.slice(0, 1).toLowerCase()}${word.slice(1)}`;
  if (bare === word.toLowerCase() || bare === word.toUpperCase() || bare === lowerFirst) {
    return unit;
  }
  const head = name.slice(0, -word.length);
  if (name.endsWith(word) && CAMEL_BOUNDARY.test(head)) {
    return unit;
  }
  return snakeUnit(name, word, unit);
}

export function unitOfName(name: string): Unit | undefined {
  if (typeof name !== 'string' || name.length === 0 || RATIO.test(name) || FLAG.test(name)) {
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

export function isEpochName(name: string): boolean {
  return EPOCH_WORD.test(name);
}

function startsWithConverter(name: string): boolean {
  return CONVERTER_PREFIXES.some(
    (prefix) => name.startsWith(prefix) && !/^[a-z]/u.test(name.slice(prefix.length)),
  );
}

export function unitOfCallName(name: string): Unit | undefined {
  return startsWithConverter(name) ? undefined : unitOfName(name);
}

export function argumentUnitOfCallName(name: string): Unit | undefined {
  return startsWithConverter(name) ? unitOfName(name) : undefined;
}

export function unitOfConstant(name: string): Unit | undefined {
  return Object.hasOwn(UNIT_CONSTANTS, name) ? UNIT_CONSTANTS[name] : undefined;
}

function isUnit(value: string): value is Unit {
  return Object.hasOwn(TIME_UNITS, value);
}

function timeUnit(unit: string | undefined): { scale: number; label: string } {
  if (unit === undefined || !isUnit(unit)) {
    throw new TypeError(`Unknown time unit: ${String(unit)}`);
  }
  return TIME_UNITS[unit];
}

export function convertedUnit(
  unit: string | undefined,
  factor: number,
  operator: string,
): Unit | undefined {
  if (unit === undefined || !Number.isFinite(factor) || factor <= 0) {
    return undefined;
  }
  const { scale } = timeUnit(unit);
  const target = operator === '*' ? scale / factor : scale * factor;
  return Object.keys(TIME_UNITS)
    .filter(isUnit)
    .find((key) => TIME_UNITS[key].scale === target);
}

export function unitFactor(left: string | undefined, right: string | undefined): number {
  const ratio = timeUnit(left).scale / timeUnit(right).scale;
  return ratio >= 1 ? ratio : 1 / ratio;
}

export function conversionExample(
  value: string,
  from: string | undefined,
  to: string | undefined,
): string {
  const factor = unitFactor(from, to);
  const operand = /\s/u.test(value) ? `(${value})` : value;
  return timeUnit(from).scale > timeUnit(to).scale
    ? `${operand} * ${String(factor)}`
    : `${operand} / ${String(factor)}`;
}

export function unitLabel(unit: string | undefined): string {
  return timeUnit(unit).label;
}
