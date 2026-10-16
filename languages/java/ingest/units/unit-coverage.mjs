export function isInside(inner, outer) {
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

function sums(matches) {
  function sum(key) {
    return {
      covered: matches.reduce((total, method) => total + method[key].covered, 0),
      total: matches.reduce((total, method) => total + method[key].total, 0),
    };
  }
  return { lines: sum('lines'), branches: sum('branches') };
}

function percentOf({ lines, branches }) {
  const percents = [lines, branches]
    .filter((measure) => measure.total > 0)
    .map((measure) => (measure.covered / measure.total) * 100);
  return percents.length === 0 ? undefined : Math.min(...percents);
}

function without(own, lent) {
  const remaining = {};
  for (const key of ['lines', 'branches']) {
    remaining[key] = {
      covered: Math.max(0, own[key].covered - lent[key].covered),
      total: Math.max(0, own[key].total - lent[key].total),
    };
  }
  return remaining;
}

export function lowestCoverage(matches, lentMatches = []) {
  const own = sums(matches);
  if (lentMatches.length === 0) {
    return percentOf(own);
  }
  const remaining = without(own, sums(lentMatches));
  return percentOf(remaining) ?? percentOf(own);
}

export function coverageLookup({ pools, keysOf, selectMethods, parsed }) {
  const siblings = Map.groupBy(parsed, (fn) => fn.file);
  const resolutions = new Map();

  function select(fn, filePath, pool) {
    return keysOf(filePath).flatMap((key) =>
      selectMethods(fn, pool.get(key) ?? [], siblings.get(fn.file)),
    );
  }

  function resolve(fn, filePath) {
    if (!resolutions.has(fn)) {
      resolutions.set(fn, resolution(fn, filePath));
    }
    return resolutions.get(fn);
  }

  function resolution(fn, filePath) {
    const methods = fn.lineScoped ? [] : select(fn, filePath, pools.methods);
    if (methods.length > 0) {
      return { matches: methods, byLines: false };
    }
    if (!fn.lineScoped && fn.lineFallback !== true) {
      return { matches: [], byLines: false };
    }
    return { matches: select({ ...fn, lineScoped: true }, filePath, pools.lines), byLines: true };
  }

  function lentLines(fn, filePath) {
    const inlined = (unit) => unit.lineFallback === true && resolve(unit, filePath).byLines;
    return siblings
      .get(fn.file)
      .filter(
        (unit) =>
          unit.lineFallback === true &&
          isInside(unit, fn) &&
          inlined(unit) &&
          siblings
            .get(fn.file)
            .filter((between) => isInside(unit, between) && isInside(between, fn))
            .every((between) => between.lineFallback === true && inlined(between)),
      )
      .flatMap((unit) => resolve(unit, filePath).matches);
  }

  return function coverageOf(fn, filePath) {
    const { matches, byLines } = resolve(fn, filePath);
    return lowestCoverage(matches, byLines ? [] : lentLines(fn, filePath));
  };
}
