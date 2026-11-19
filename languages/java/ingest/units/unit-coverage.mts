import { smallest as untypedSmallest } from '../../../../shared/lists/items.mjs';
import type {
  Counts,
  CoveragePools,
  CoverageRequest,
  CoverageUnit,
  FunctionUnit,
  SelectMethods,
} from './unit-types.mts';

type Measure = 'lines' | 'branches';
type Span = { readonly start: number; readonly end: number };
type Resolution = { readonly matches: CoverageUnit[]; readonly byLines: boolean };
type LookupState = {
  readonly pools: CoveragePools;
  readonly keysOf: (filePath: string) => readonly string[];
  readonly selectMethods: SelectMethods;
  readonly siblings: ReadonlyMap<string, readonly FunctionUnit[]>;
  readonly resolutions: Map<FunctionUnit, Resolution>;
};
type PoolSelection = {
  readonly filePath: string;
  readonly pool: ReadonlyMap<string, readonly CoverageUnit[]>;
};

const smallest: (values: readonly number[]) => number = untypedSmallest;
const MEASURES: readonly Measure[] = ['lines', 'branches'];
const LAMBDA_OWNER_SEGMENT = -2;
const NO_COUNTS: Counts = { covered: 0, total: 0 };

function isInside(inner: Span, outer: Span): boolean {
  return (
    inner.start >= outer.start &&
    inner.end <= outer.end &&
    (inner.start > outer.start || inner.end < outer.end)
  );
}

function ownName(fn: FunctionUnit): string | undefined {
  const parts = fn.name.split('.');
  return fn.lambda ? parts.at(LAMBDA_OWNER_SEGMENT) : parts.at(-1);
}

export function ownRange(
  fn: FunctionUnit,
  candidates: readonly CoverageUnit[],
  siblings: readonly FunctionUnit[],
): CoverageUnit[] {
  const inner = siblings.filter((other) => other !== fn && isInside(other, fn));
  const name = ownName(fn);
  function held(method: CoverageUnit): boolean {
    return inner.some((other) => method.line >= other.start && method.line <= other.end);
  }
  return candidates.filter(
    (method) =>
      method.line >= fn.start &&
      method.line <= fn.end &&
      (fn.lambda ? method.name !== name && !held(method) : method.name === name || !held(method)),
  );
}

function sum(matches: readonly CoverageUnit[], key: Measure): Counts {
  return {
    covered: matches.reduce((total, method) => total + method[key].covered, 0),
    total: matches.reduce((total, method) => total + method[key].total, 0),
  };
}

function percentOf(measures: readonly Counts[]): number | undefined {
  const percents = measures
    .filter((measure) => measure.total > 0)
    .map((measure) => (measure.covered / measure.total) * 100);
  return percents.length === 0 ? undefined : smallest(percents);
}

function remainder(own: Counts, lent: Counts): Counts {
  return {
    covered: Math.max(0, own.covered - lent.covered),
    total: Math.max(0, own.total - lent.total),
  };
}

function lowestCoverage(
  matches: readonly CoverageUnit[],
  lentMatches: readonly CoverageUnit[],
): number | undefined {
  const own = MEASURES.map((key) => sum(matches, key));
  const lent = MEASURES.map((key) => sum(lentMatches, key));
  const remaining = own.map((measure, index) => remainder(measure, lent[index] ?? NO_COUNTS));
  return percentOf(remaining) ?? percentOf(own);
}

function siblingsOf(state: LookupState, fn: FunctionUnit): readonly FunctionUnit[] {
  return state.siblings.get(fn.file) ?? [];
}

function selectIn(
  state: LookupState,
  fn: FunctionUnit,
  { filePath, pool }: PoolSelection,
): CoverageUnit[] {
  return state
    .keysOf(filePath)
    .flatMap((key) => state.selectMethods(fn, pool.get(key) ?? [], siblingsOf(state, fn)));
}

function resolution(state: LookupState, fn: FunctionUnit, filePath: string): Resolution {
  const methods = fn.lineScoped ? [] : selectIn(state, fn, { filePath, pool: state.pools.methods });
  if (methods.length > 0 || !(fn.lineScoped || fn.lineFallback)) {
    return { matches: methods, byLines: false };
  }
  const lineUnit = { ...fn, lineScoped: true };
  return {
    matches: selectIn(state, lineUnit, { filePath, pool: state.pools.lines }),
    byLines: true,
  };
}

function resolve(state: LookupState, fn: FunctionUnit, filePath: string): Resolution {
  const known = state.resolutions.get(fn);
  if (known !== undefined) {
    return known;
  }
  const created = resolution(state, fn, filePath);
  state.resolutions.set(fn, created);
  return created;
}

function inlinedLambda(state: LookupState, unit: FunctionUnit, filePath: string): boolean {
  return unit.lineFallback && resolve(state, unit, filePath).byLines;
}

function onlyInlinedBetween(
  state: LookupState,
  { unit, fn, filePath }: { unit: FunctionUnit; fn: FunctionUnit; filePath: string },
): boolean {
  return siblingsOf(state, fn)
    .filter((between) => isInside(unit, between) && isInside(between, fn))
    .every((between) => inlinedLambda(state, between, filePath));
}

function lentMatches(state: LookupState, fn: FunctionUnit, filePath: string): CoverageUnit[] {
  return siblingsOf(state, fn)
    .filter(
      (unit) =>
        isInside(unit, fn) &&
        inlinedLambda(state, unit, filePath) &&
        onlyInlinedBetween(state, { unit, fn, filePath }),
    )
    .flatMap((unit) => resolve(state, unit, filePath).matches);
}

export function coverageLookup({
  pools,
  keysOf,
  selectMethods,
  parsed,
}: CoverageRequest): (fn: FunctionUnit, filePath: string) => number | undefined {
  const state: LookupState = {
    pools,
    keysOf,
    selectMethods,
    siblings: Map.groupBy(parsed, (fn) => fn.file),
    resolutions: new Map(),
  };
  return (fn, filePath) => {
    const { matches, byLines } = resolve(state, fn, filePath);
    return lowestCoverage(matches, byLines ? [] : lentMatches(state, fn, filePath));
  };
}
