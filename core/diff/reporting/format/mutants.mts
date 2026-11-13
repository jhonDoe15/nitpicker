import { RULE_IDS } from '../../../../shared/policy.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

const SURVIVED: unknown = RULE_IDS.mutantSurvived;
const NO_COVERAGE: unknown = RULE_IDS.mutantNoCoverage;

function lineOf(finding: ReportEntry): unknown {
  return fieldOf(finding['location'], 'line');
}

const SURVIVOR_LIMIT = 3;

export function foldMutants(findings: readonly ReportEntry[]): ReportEntry[] {
  const groups = new Map<string, ReportEntry[]>();
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

function isMutant({ rule }: ReportEntry): boolean {
  return rule === SURVIVED || rule === NO_COVERAGE;
}

function functionKey({ tool, path, symbol }: ReportEntry): string {
  return [tool, path, symbol ?? ''].join('\0');
}

function foldFunction(mutants: readonly ReportEntry[]): ReportEntry[] {
  const sorted = mutants.toSorted(
    (left, right) => Number(lineOf(left) ?? 0) - Number(lineOf(right) ?? 0),
  );
  return [
    ...foldUnreached(sorted.filter(({ rule }) => rule === NO_COVERAGE)),
    ...capSurvivors(sorted.filter(({ rule }) => rule === SURVIVED)),
  ];
}

function foldUnreached(mutants: ReportEntry[]): ReportEntry[] {
  const [first] = mutants;
  if (first === undefined || mutants.length < 2) {
    return mutants;
  }
  return [
    {
      ...entryOf(first),
      ...(first['location'] === undefined ? {} : { location: { line: lineOf(first) } }),
      folded: true,
      message: `${functionLabel(first['symbol'])}: ${String(mutants.length)} mutants${lineSpan(mutants)} that no test runs. Add a test that reaches this code.`,
    },
  ];
}

function capSurvivors(mutants: ReportEntry[]): ReportEntry[] {
  const [first] = mutants;
  const hidden = mutants.slice(SURVIVOR_LIMIT);
  const [firstHidden] = hidden;
  if (first === undefined || firstHidden === undefined) {
    return mutants;
  }
  const noun = hidden.length === 1 ? 'mutant' : 'mutants';
  const line = lineOf(firstHidden);
  const from = line === undefined ? '' : ` from line ${String(line)}`;
  return [
    ...mutants.slice(0, SURVIVOR_LIMIT),
    {
      ...entryOf(first),
      ...(line === undefined ? {} : { location: { line } }),
      folded: true,
      message: `and ${String(hidden.length)} more surviving ${noun} in ${functionLabel(first['symbol'])}${from} (listed in the diagnostics file)`,
    },
  ];
}

function entryOf({ tool, rule, path }: ReportEntry): ReportEntry {
  return { tool, rule, path };
}

function functionLabel(symbol: unknown): string {
  return symbol === undefined ? 'top-level code' : textOf(symbol).replace(/\(.*$/su, '');
}

function lineSpan(mutants: readonly ReportEntry[]): string {
  const lines = mutants.flatMap((mutant) =>
    mutant['location'] === undefined ? [] : [Number(lineOf(mutant))],
  );
  if (lines.length === 0) {
    return '';
  }
  const first = Math.min(...lines);
  const last = Math.max(...lines);
  return first === last
    ? ` on line ${String(first)}`
    : ` on lines ${String(first)} to ${String(last)}`;
}
