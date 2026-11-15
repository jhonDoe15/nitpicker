import { patternLength } from '../scanning/pattern-length.mjs';

const IGNORED = new Set(['message', 'groups', 'payload', 'flags', 'inclusive']);
const TEXT_TYPES = /^(?:String|string|str|CharSequence|char)\b/u;

function number(value) {
  return typeof value === 'number' ? value : undefined;
}

function lengths(min, max) {
  return { min: number(min), max: number(max) };
}

function fromPattern(regex, implicitAnchors = false) {
  const range = typeof regex === 'string' ? patternLength(regex, { implicitAnchors }) : undefined;
  return range === undefined ? {} : { min: range.min, max: range.max };
}

function digits({ named }, type) {
  const integer = number(named.get('integer'));
  if (integer === undefined) {
    return {};
  }
  if (TEXT_TYPES.test(type)) {
    const fraction = number(named.get('fraction')) ?? 0;
    return { max: integer + fraction + (fraction > 0 ? 1 : 0) };
  }
  return { maximum: 10 ** integer - 1 };
}

const BY_NAME = {
  size: ({ named }) => lengths(named.get('min'), named.get('max')),
  length: ({ named, positional }) =>
    named.size > 0
      ? lengths(named.get('min'), named.get('max'))
      : lengths(positional[0], positional[1]),
  maxlength: ({ positional }) => lengths(undefined, positional[0]),
  minlength: ({ positional }) => lengths(positional[0], undefined),
  pattern: ({ named, positional }) => fromPattern(named.get('regexp') ?? positional[0], true),
  matches: ({ positional }) => fromPattern(positional[0]),
  max: ({ named, positional }) => ({ maximum: number(named.get('value') ?? positional[0]) }),
  decimalmax: ({ named, positional }) => ({
    maximum: Number(named.get('value') ?? positional[0]),
  }),
};

export function isUnresolved({ named, positional }) {
  const own = [...named].filter(([key]) => !IGNORED.has(key)).map(([, value]) => value);
  return [...own, ...positional.slice(0, 2)].some((value) => value === undefined);
}

export function annotationBounds(name, args, type = '') {
  const key = name.toLowerCase();
  if (BY_NAME[key] === undefined && key !== 'digits') {
    return {};
  }
  const bounds = key === 'digits' ? digits(args, type) : BY_NAME[key](args);
  return isUnresolved(args) ? { ...bounds, unresolved: true } : bounds;
}

export function combineBounds(list) {
  function defined(key) {
    return list.map((bounds) => bounds[key]).filter((value) => value !== undefined);
  }
  const maxima = defined('max').filter((value) => Number.isFinite(value));
  const mins = defined('min').filter((value) => value > 0);
  const maximums = defined('maximum').filter((value) => Number.isFinite(value));
  return {
    unresolved: list.some((bounds) => bounds.unresolved === true),
    max: maxima.length === 0 ? undefined : Math.min(...maxima),
    min: mins.length === 0 ? undefined : Math.max(...mins),
    maximum: maximums.length === 0 ? undefined : Math.min(...maximums),
  };
}

export function hasBounds({ max, min, maximum, unresolved }) {
  return unresolved === true || max !== undefined || min !== undefined || maximum !== undefined;
}
