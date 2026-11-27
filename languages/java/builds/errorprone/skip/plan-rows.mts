import path from 'node:path';
import { engineFindingOf } from '../../../../../shared/engine/engine-rows.mts';
import { fieldOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';
import type { ArgumentSet } from '../engine-arguments.mts';
import type { EngineRow } from '../engine-diagnostics.mts';
import { NOT_DISABLEABLE } from '../options/check-levels.mts';
import { lombokUnsuppressed } from './runner-checks.mts';
import type { SourceSetPlan } from './source-set-plan.mts';

const MAY_REPORT = '_MayReport';

/** For each file, the checks the engine was asked about that may report there. */
export function mayReportOf(report: unknown): ReadonlyMap<string, readonly string[]> {
  const rows = listOf(fieldOf(report, 'findings')).map(engineFindingOf);
  return new Map(
    rows
      .filter(({ rule }) => rule === MAY_REPORT)
      .map(({ file, message }) => [file, message.split(',').filter(Boolean)] as const),
  );
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
