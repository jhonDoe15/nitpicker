const MEASURES = ['lines', 'branches'];

function isInside(inner, outer) {
  return (
    inner.start >= outer.start &&
    inner.end <= outer.end &&
    (inner.start > outer.start || inner.end < outer.end)
  );
}

export function ownRange(fn, candidates, siblings) {
  const inner = siblings.filter((other) => other !== fn && isInside(other, fn));
  return candidates.filter(
    (method) =>
      method.line >= fn.start &&
      method.line <= fn.end &&
      !inner.some((other) => method.line >= other.start && method.line <= other.end),
  );
}

function sum(matches, key) {
  return {
    covered: matches.reduce((total, method) => total + method[key].covered, 0),
    total: matches.reduce((total, method) => total + method[key].total, 0),
  };
}

function percentOf(measures) {
  const percents = measures
    .filter((measure) => measure.total > 0)
    .map((measure) => (measure.covered / measure.total) * 100);
  return percents.length === 0 ? undefined : Math.min(...percents);
}

function remainder(own, lent) {
  return {
    covered: Math.max(0, own.covered - lent.covered),
    total: Math.max(0, own.total - lent.total),
  };
}

function lowestCoverage(matches, lentMatches = []) {
  const own = MEASURES.map((key) => sum(matches, key));
  const lent = MEASURES.map((key) => sum(lentMatches, key));
  const remaining = own.map((measure, index) => remainder(measure, lent[index]));
  return percentOf(remaining) ?? percentOf(own);
}

function selectIn(state, fn, { filePath, pool }) {
  return state
    .keysOf(filePath)
    .flatMap((key) => state.selectMethods(fn, pool.get(key) ?? [], state.siblings.get(fn.file)));
}

function resolution(state, fn, filePath) {
  const methods = fn.lineScoped ? [] : selectIn(state, fn, { filePath, pool: state.pools.methods });
  if (methods.length > 0 || (!fn.lineScoped && fn.lineFallback !== true)) {
    return { matches: methods, byLines: false };
  }
  const lineUnit = { ...fn, lineScoped: true };
  return {
    matches: selectIn(state, lineUnit, { filePath, pool: state.pools.lines }),
    byLines: true,
  };
}

function resolve(state, fn, filePath) {
  if (!state.resolutions.has(fn)) {
    state.resolutions.set(fn, resolution(state, fn, filePath));
  }
  return state.resolutions.get(fn);
}

function inlinedLambda(state, unit, filePath) {
  return unit.lineFallback === true && resolve(state, unit, filePath).byLines;
}

function onlyInlinedBetween(state, { unit, fn, filePath }) {
  return state.siblings
    .get(fn.file)
    .filter((between) => isInside(unit, between) && isInside(between, fn))
    .every((between) => inlinedLambda(state, between, filePath));
}

function lentMatches(state, fn, filePath) {
  return state.siblings
    .get(fn.file)
    .filter(
      (unit) =>
        isInside(unit, fn) &&
        inlinedLambda(state, unit, filePath) &&
        onlyInlinedBetween(state, { unit, fn, filePath }),
    )
    .flatMap((unit) => resolve(state, unit, filePath).matches);
}

export function coverageLookup({ pools, keysOf, selectMethods, parsed }) {
  const state = {
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
