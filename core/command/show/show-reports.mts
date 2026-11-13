import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { outputRootFor as untypedOutputRoot } from '../../diff/reporting/reporters.mjs';
import { failingHeadTests as untypedFailingTests } from '../../diff/reporting/failing-tests/failing-tests.mjs';
import { fieldOf, fieldsOf, listOf, numberOr, textOf } from '../../../shared/values/readers.mts';

type ReportKind = 'diff' | 'snapshot';

type Entry = Readonly<Record<string, unknown>>;

export type LoadedReport = {
  readonly kind: ReportKind;
  readonly outputRoot: string;
  readonly summary: Entry;
  readonly findings: readonly Entry[];
  readonly held: readonly Entry[];
  readonly toolErrors: readonly Entry[];
  readonly notes: readonly Entry[];
};

const outputRootFor: (
  projectRoot: string,
  outputOption: string | undefined,
  kind: ReportKind,
) => string = untypedOutputRoot;
const failingTestsOf: (toolErrors: readonly Entry[]) => readonly unknown[] = untypedFailingTests;

const FINDINGS_FILE = { diff: 'new-findings.json', snapshot: 'findings.json' } as const;

function hasReport(outputRoot: string, kind: ReportKind): boolean {
  return (
    existsSync(path.join(outputRoot, 'summary.json')) &&
    existsSync(path.join(outputRoot, path.basename(FINDINGS_FILE[kind])))
  );
}

function readList(outputRoot: string, name: string): readonly Entry[] {
  const file = path.join(outputRoot, path.basename(name));
  if (!existsSync(file)) {
    return [];
  }
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return listOf(value).map(fieldsOf);
}

type Request = { readonly all: boolean; readonly outputRoot?: string | undefined };
type Location = { readonly kind: ReportKind; readonly outputRoot: string };

function generatedAtOf(outputRoot: string): number {
  const summary: unknown = JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
  const time = Date.parse(textOf(fieldOf(summary, 'generatedAt')));
  return Number.isNaN(time) ? 0 : time;
}

function newest(found: readonly Location[]): Location | undefined {
  return found.reduce<Location | undefined>(
    (best, candidate) =>
      best === undefined || generatedAtOf(candidate.outputRoot) > generatedAtOf(best.outputRoot)
        ? candidate
        : best,
    undefined,
  );
}

export function locateReport(projectRoot: string, { all, outputRoot }: Request): Location {
  const order: readonly ReportKind[] = all ? ['snapshot'] : ['diff', 'snapshot'];
  const candidates = order.map((kind) => ({
    kind,
    outputRoot: outputRootFor(projectRoot, outputRoot, kind),
  }));
  const found = newest(candidates.filter(({ kind, outputRoot: root }) => hasReport(root, kind)));
  const fallbackKind: ReportKind = all ? 'snapshot' : 'diff';
  return (
    found ?? {
      kind: fallbackKind,
      outputRoot: outputRootFor(projectRoot, outputRoot, fallbackKind),
    }
  );
}

export function loadReport({ kind, outputRoot }: Location): LoadedReport | undefined {
  if (!hasReport(outputRoot, kind)) {
    return undefined;
  }
  const summary: unknown = JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
  return {
    kind,
    outputRoot,
    summary: fieldsOf(summary),
    findings: readList(outputRoot, FINDINGS_FILE[kind]),
    held: kind === 'diff' ? readList(outputRoot, 'held-findings.json') : [],
    toolErrors: readList(outputRoot, 'tool-errors.json'),
    notes: kind === 'diff' ? readList(outputRoot, 'notes.json') : [],
  };
}

export function runFailed(report: LoadedReport): boolean {
  const enforceable = report.findings.filter(
    (finding) => fieldOf(finding, 'classification') === 'enforceable',
  ).length;
  const counted = numberOr(
    fieldOf(
      report.summary,
      report.kind === 'diff' ? 'newEnforceableFindings' : 'enforceableFindings',
    ),
    0,
  );
  return (
    Math.max(enforceable, counted) > 0 ||
    failingTestsOf(report.toolErrors).length > 0 ||
    textOf(fieldOf(report.summary, 'overallStatus')) === 'tool-error'
  );
}
