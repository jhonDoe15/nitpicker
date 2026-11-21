import { patternLength } from '../scanning/pattern-length.mts';
import { largest, smallest } from '../../../lists/lists.mts';
import type {
  AnyBounds,
  Bounds,
  CombinedBounds,
  Literal,
  ParsedArguments,
} from '../fact-types.mts';

const IGNORED = new Set(['message', 'groups', 'payload', 'flags', 'inclusive']);
const TEXT_TYPES = /^(?:String|string|str|CharSequence|char)\b/u;

export function number(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function lengths(min: Literal, max: Literal): Bounds {
  return { min: number(min), max: number(max) };
}

function fromPattern(regex: Literal, implicitAnchors = false): Bounds {
  const range = typeof regex === 'string' ? patternLength(regex, { implicitAnchors }) : undefined;
  return range === undefined ? {} : { min: range.min, max: range.max };
}

function digits({ named }: ParsedArguments, type: string): Bounds {
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

const BY_NAME: Readonly<Record<string, (args: ParsedArguments) => Bounds>> = {
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

export function isUnresolved({ named, positional }: ParsedArguments): boolean {
  const own = [...named].filter(([key]) => !IGNORED.has(key)).map(([, value]) => value);
  return [...own, ...positional.slice(0, 2)].some((value) => value === undefined);
}

export function annotationBounds(name: string, args: ParsedArguments, type = ''): Bounds {
  const key = name.toLowerCase();
  const named = Object.hasOwn(BY_NAME, key) ? BY_NAME[key] : undefined;
  if (named === undefined && key !== 'digits') {
    return {};
  }
  const bounds = key === 'digits' || named === undefined ? digits(args, type) : named(args);
  return isUnresolved(args) ? { ...bounds, unresolved: true } : bounds;
}

export function combineBounds(list: readonly AnyBounds[]): CombinedBounds {
  function defined(key: 'max' | 'min' | 'maximum'): number[] {
    return list
      .map((bounds) => bounds[key])
      .filter((value): value is number => value !== undefined);
  }
  const maxima = defined('max').filter((value) => Number.isFinite(value));
  const mins = defined('min').filter((value) => value > 0);
  const maximums = defined('maximum').filter((value) => Number.isFinite(value));
  return {
    unresolved: list.some((bounds) => bounds.unresolved === true),
    max: maxima.length === 0 ? undefined : smallest(maxima),
    min: mins.length === 0 ? undefined : largest(mins),
    maximum: maximums.length === 0 ? undefined : smallest(maximums),
  };
}

export function hasBounds({ max, min, maximum, unresolved }: AnyBounds): boolean {
  return unresolved === true || max !== undefined || min !== undefined || maximum !== undefined;
}
