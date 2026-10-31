import { RULE_IDS } from '../../../../shared/policy.mjs';

const SURVIVOR_LIMIT = 3;

export function foldMutants(findings) {
  const groups = new Map();
  for (const finding of findings.filter(isMutant)) {
    const key = functionKey(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return findings.flatMap((finding) => {
    if (!isMutant(finding)) {
      return [finding];
    }
    const key = functionKey(finding);
    const group = groups.get(key);
    groups.delete(key);
    return group === undefined ? [] : foldFunction(group);
  });
}

function isMutant({ rule }) {
  return rule === RULE_IDS.mutantSurvived || rule === RULE_IDS.mutantNoCoverage;
}

function functionKey({ tool, path, symbol }) {
  return [tool, path, symbol ?? ''].join('\0');
}

function foldFunction(mutants) {
  const sorted = mutants.toSorted(
    (left, right) => (left.location?.line ?? 0) - (right.location?.line ?? 0),
  );
  return [
    ...foldUnreached(sorted.filter(({ rule }) => rule === RULE_IDS.mutantNoCoverage)),
    ...capSurvivors(sorted.filter(({ rule }) => rule === RULE_IDS.mutantSurvived)),
  ];
}

function foldUnreached(mutants) {
  if (mutants.length < 2) {
    return mutants;
  }
  const [first] = mutants;
  return [
    {
      ...entryOf(first),
      ...(first.location === undefined ? {} : { location: { line: first.location.line } }),
      message: `${functionLabel(first.symbol)}: ${String(mutants.length)} mutants${lineSpan(mutants)} that no test runs. Add a test that reaches this code.`,
    },
  ];
}

function capSurvivors(mutants) {
  if (mutants.length <= SURVIVOR_LIMIT) {
    return mutants;
  }
  const hidden = mutants.slice(SURVIVOR_LIMIT);
  const noun = hidden.length === 1 ? 'mutant' : 'mutants';
  const line = hidden[0].location?.line;
  const from = line === undefined ? '' : ` from line ${String(line)}`;
  return [
    ...mutants.slice(0, SURVIVOR_LIMIT),
    {
      ...entryOf(mutants[0]),
      message: `and ${String(hidden.length)} more surviving ${noun} in ${functionLabel(mutants[0].symbol)}${from} (listed in the diagnostics file)`,
    },
  ];
}

function entryOf({ tool, rule, path }) {
  return { tool, rule, path };
}

function functionLabel(symbol) {
  return symbol === undefined ? 'top-level code' : symbol.replace(/\(.*$/su, '');
}

function lineSpan(mutants) {
  const lines = mutants.flatMap(({ location }) => (location === undefined ? [] : [location.line]));
  if (lines.length === 0) {
    return '';
  }
  const first = Math.min(...lines);
  const last = Math.max(...lines);
  return first === last
    ? ` on line ${String(first)}`
    : ` on lines ${String(first)} to ${String(last)}`;
}
