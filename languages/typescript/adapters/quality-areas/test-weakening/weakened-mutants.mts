import type { Finding } from '../../static-checks/shared.mts';
import { hash } from '../typed/repository.mts';
import {
  type Mutant,
  type MutationFile,
  type MutationReport,
  exceptionRoute,
  mutantRuleId,
} from '../typed/mutation.mts';
import { type Hunk, baseLineOf } from './line-shifts.mts';

type LineRange = readonly [number, number];

export type MutationScope = {
  readonly targets: readonly string[];
  readonly testedModules: readonly string[];
  readonly lineShifts?: ReadonlyMap<string, readonly Hunk[]>;
};

type Scope = {
  readonly tested: ReadonlySet<string>;
  readonly ranges: ReadonlyMap<string, readonly LineRange[]>;
  readonly lineShifts: ReadonlyMap<string, readonly Hunk[]>;
};

type KeyedMutant = { readonly mutant: Mutant; readonly key: string };

type BaseLine = (line: number | undefined) => number | undefined;

type EscapedMutants = { readonly filePath: string; readonly escaped: readonly Mutant[] };

const CAUGHT_STATUSES = new Set(['Killed', 'Timeout']);
const ESCAPED_STATUSES = new Set(['Survived', 'NoCoverage']);
const CODE_LIMIT = 80;

function startLine(mutant: Mutant): number | undefined {
  return mutant.location?.start?.line;
}

function onChangedLine(mutant: Mutant, ranges: readonly LineRange[]): boolean {
  const line = startLine(mutant);
  return line !== undefined && ranges.some(([first, last]) => line >= first && line <= last);
}

function rangesByFile(targets: readonly string[]): Map<string, LineRange[]> {
  const ranges = new Map<string, LineRange[]>();
  for (const target of targets) {
    const match = /^(.*):(\d+)-(\d+)$/u.exec(target);
    const [, file, first, last] = match ?? [];
    if (file !== undefined) {
      ranges.set(file, [...(ranges.get(file) ?? []), [Number(first), Number(last)]]);
    }
  }
  return ranges;
}

function withMutants(
  report: MutationReport,
  selectMutants: (filePath: string, mutants: readonly Mutant[]) => Mutant[],
): MutationReport {
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files ?? {}).map(([filePath, file]): [string, MutationFile] => [
        filePath,
        { ...file, mutants: selectMutants(filePath, file.mutants ?? []) },
      ]),
    ),
  };
}

export function mutationTargetsWithTestedModules(
  targets: readonly string[],
  testedModules: readonly string[],
): string[] {
  const tested = new Set(testedModules);
  return [
    ...targets.filter((target) => !tested.has(target.replace(/:\d+-\d+$/u, ''))),
    ...testedModules,
  ];
}

function scopeOf({ targets, testedModules, lineShifts = new Map() }: MutationScope): Scope {
  return { tested: new Set(testedModules), ranges: rangesByFile(targets), lineShifts };
}

function isOnChangedCode(scope: Scope, filePath: string, mutant: Mutant): boolean {
  return !scope.tested.has(filePath) || onChangedLine(mutant, scope.ranges.get(filePath) ?? []);
}

export function changedCodeMutants(
  report: MutationReport,
  mutationScope: MutationScope,
): MutationReport {
  const scope = scopeOf(mutationScope);
  return withMutants(report, (filePath, mutants) =>
    mutants.filter((mutant) => isOnChangedCode(scope, filePath, mutant)),
  );
}

function escapedMutants(report: MutationReport, scope: Scope): EscapedMutants[] {
  return Object.entries(report.files ?? {})
    .filter(([filePath]) => scope.tested.has(filePath))
    .map(([filePath, file]) => ({
      filePath,
      escaped: (file.mutants ?? []).filter(
        (mutant) =>
          !isOnChangedCode(scope, filePath, mutant) && ESCAPED_STATUSES.has(mutant.status),
      ),
    }));
}

export function hasWeakeningCandidates(
  report: MutationReport,
  mutationScope: MutationScope,
): boolean {
  return escapedMutants(report, scopeOf(mutationScope)).some(({ escaped }) => escaped.length > 0);
}

function baseLineMapper(scope: Scope, filePath: string): BaseLine {
  const hunks = scope.lineShifts.get(filePath) ?? [];
  return (line) => (typeof line === 'number' ? baseLineOf(hunks, line) : undefined);
}

function keyedMutants(mutants: readonly Mutant[], baseLine: BaseLine): KeyedMutant[] {
  return mutants.flatMap((mutant) => {
    const line = baseLine(startLine(mutant));
    if (line === undefined) {
      return [];
    }
    const column = String(mutant.location?.start?.column);
    const key = [mutant.mutatorName, mutant.replacement ?? '', `${String(line)}:${column}`];
    return [{ mutant, key: key.join('\0') }];
  });
}

function baseRange(baseLine: BaseLine, mutant: Mutant): string[] {
  const first = baseLine(startLine(mutant));
  const last = baseLine(mutant.location?.end?.line ?? startLine(mutant));
  return first === undefined || last === undefined ? [] : [`${String(first)}-${String(last)}`];
}

export function baseMutationTargets(
  headReport: MutationReport,
  mutationScope: MutationScope,
): string[] {
  const scope = scopeOf(mutationScope);
  const targets = escapedMutants(headReport, scope).flatMap(({ filePath, escaped }) => {
    const baseLine = baseLineMapper(scope, filePath);
    return escaped.flatMap((mutant) =>
      baseRange(baseLine, mutant).map((range) => `${filePath}:${range}`),
    );
  });
  return [...new Set(targets)];
}

function caughtKeys(baseFile: MutationFile | undefined): Set<string> {
  const caught = (baseFile?.mutants ?? []).filter((mutant) => CAUGHT_STATUSES.has(mutant.status));
  return new Set(keyedMutants(caught, (line) => line).map(({ key }) => key));
}

function inlineCode(value: unknown): string {
  const text = String(value).replaceAll(/\s+/gu, ' ').trim();
  return `\`${text.length > CODE_LIMIT ? `${text.slice(0, CODE_LIMIT)}…` : text}\``;
}

function weakenedMessage(
  filePath: string,
  mutant: Mutant,
): { readonly message: string; readonly allowedForm: string } {
  const change =
    mutant.original === undefined || mutant.replacement === undefined
      ? `${mutant.mutatorName} mutant`
      : `${mutant.mutatorName} mutant (${inlineCode(mutant.original)} replaced with ${inlineCode(mutant.replacement)})`;
  const outcome = mutant.status === 'NoCoverage' ? 'no test runs it now' : 'it survives now';
  const allowedForm = 'Restore the assertion that caught it, or add one.';
  const route = exceptionRoute(mutantRuleId(mutant.status), filePath);
  const problem = `This change weakened the tests of ${filePath}: the base tests caught this ${change}`;
  return { message: `${problem}, but ${outcome}. ${allowedForm} ${route}`, allowedForm };
}

function weakenedFinding(
  analyzerName: string,
  filePath: string,
  { mutant, key }: KeyedMutant,
): Finding & { readonly allowedForm: string } {
  const line = startLine(mutant);
  const column = mutant.location?.start?.column;
  return {
    tool: analyzerName,
    rule: mutantRuleId(mutant.status),
    path: filePath,
    identity: `weakened|${hash(key)}`,
    ...weakenedMessage(filePath, mutant),
    classification: 'enforceable',
    ...(typeof line === 'number'
      ? { location: { line, ...(typeof column === 'number' ? { column } : {}) } }
      : {}),
  };
}

export function weakenedTestFindings({
  headReport,
  baseReport,
  mutationScope,
  analyzerName,
}: {
  readonly headReport: MutationReport;
  readonly baseReport: MutationReport;
  readonly mutationScope: MutationScope;
  readonly analyzerName: string;
}): Finding[] {
  const scope = scopeOf(mutationScope);
  return escapedMutants(headReport, scope).flatMap(({ filePath, escaped }) => {
    const caught = caughtKeys(baseReport.files?.[filePath]);
    return keyedMutants(escaped, baseLineMapper(scope, filePath))
      .filter(({ key }) => caught.has(key))
      .map((entry) => weakenedFinding(analyzerName, filePath, entry));
  });
}
