import path from 'node:path';
import { engineFindingOf } from '../../../../../shared/engine/engine-rows.mts';
import { fieldOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';
import { projectArguments, type ArgumentSet } from '../engine-arguments.mts';
import type { EngineRow } from '../engine-diagnostics.mts';
import { NOT_DISABLEABLE } from '../options/check-levels.mts';
import { lombokUnsuppressed } from './runner-checks.mts';
import type { SourceSetPlan } from './source-set-plan.mts';

const MAY_REPORT = '_MayReport';
const HAND_BACK = '_HandBack';
/** Checks whose suggestion Error Prone shows only when javac still compiles the sources with the fix applied. */
const RECOMPILED = new Set(['MutableGuiceModule', 'StaticMockMember', 'TruthAssertExpected']);
const SUGGESTION = '\n  Did you mean ';

function checksByFile(report: unknown, kind: string): ReadonlyMap<string, readonly string[]> {
  const rows = listOf(fieldOf(report, 'findings')).map(engineFindingOf);
  return new Map(
    rows
      .filter(({ rule }) => rule === kind)
      .map(({ file, message }) => [file, message.split(',').filter(Boolean)] as const),
  );
}

/** For each file, the checks the engine was asked about that may report there. */
export function mayReportOf(report: unknown): ReadonlyMap<string, readonly string[]> {
  return checksByFile(report, MAY_REPORT);
}

/** For each file, the engine's checks that it cannot answer there and leaves to Error Prone. */
export function handBackOf(report: unknown): ReadonlyMap<string, readonly string[]> {
  return checksByFile(report, HAND_BACK);
}

/** The checks handed back per file by either source. */
export function joinedHandBacks(
  first: ReadonlyMap<string, readonly string[]>,
  second: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, readonly string[]> {
  const joined = new Map<string, readonly string[]>(first);
  for (const [file, checks] of second) {
    joined.set(file, [...new Set([...(joined.get(file) ?? []), ...checks])]);
  }
  return joined;
}

/**
 * javac warnings can fail Error Prone's recompile (100 of them, or one under `-Werror`), which the engine cannot count:
 * with `-Werror` or `-Xlint` the suggestions it found for those checks go back to Error Prone.
 */
function warningsDecide(head: readonly string[]): boolean {
  return projectArguments(head).some(
    (argument) => argument === '-Werror' || (argument.startsWith('-Xlint') && argument !== '-Xlint:none'),
  );
}

/** For each file, the recompiled checks whose suggestions go back to Error Prone because warnings decide them. */
export function recompiledHandBacks(
  { head }: ArgumentSet,
  rows: readonly EngineRow[],
): ReadonlyMap<string, readonly string[]> {
  const back = new Map<string, string[]>();
  if (warningsDecide(head)) {
    rows
      .filter(({ rule, message }) => RECOMPILED.has(rule) && message.includes(SUGGESTION))
      .forEach(({ rule, file }) => back.set(file, [...new Set([...(back.get(file) ?? []), rule])]));
  }
  return back;
}

function slashed(file: string): string {
  return file.split(path.sep).join('/');
}

/** The engine's findings of the checks it ran, outside generated roots, with the annotations of their classes. */
export function rowsOf(
  report: unknown,
  checks: readonly string[],
  generated: readonly string[],
): EngineRow[] {
  const wanted = new Set(checks);
  const skipped = generated.map((root) => `${slashed(root)}/`);
  return listOf(fieldOf(report, 'findings'))
    .map((row) => ({
      ...engineFindingOf(row),
      classAnnotations: textsOf(fieldOf(row, 'arguments')),
    }))
    .filter(({ rule }) => wanted.has(rule))
    .filter(({ file }) => !skipped.some((root) => slashed(file).includes(root)));
}

export type RowContext = {
  readonly set: ArgumentSet;
  readonly plan: SourceSetPlan;
  readonly lombokOff: readonly string[];
  readonly excluded: (file: string) => boolean;
};

/**
 * Drops the rows Error Prone's runner would not report or reports itself: rows in files the project excludes, a check
 * Error Prone still runs in the files it compiles, and its Lombok checks under a `lombok.config` that turns off
 * `@SuppressWarnings`.
 */
export function keptRows(
  rows: readonly EngineRow[],
  { set, plan, lombokOff, excluded }: RowContext,
): EngineRow[] {
  const unsuppressed = lombokUnsuppressed(set.sources);
  const compiled = new Set(plan.kind === 'narrowed' ? plan.files : []);
  const rerun = new Set(plan.kind === 'narrowed' ? plan.checks : []);
  return rows.filter(
    ({ rule, file }) =>
      !(
        excluded(file) ||
        (compiled.has(file) && (rerun.has(rule) || NOT_DISABLEABLE.has(rule))) ||
        (lombokOff.includes(rule) && unsuppressed.has(file))
      ),
  );
}
