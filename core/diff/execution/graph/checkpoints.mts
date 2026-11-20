import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cacheEntryText } from '../../cache/entries/cache-entry.mts';
import type { AnalyzerTask, TaskCheckpoint } from '../tasks.mts';
import { splitByTool } from '../carried/carried-analyzers.mts';
import type { Outcome } from './outcomes.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';

function isClean(outcome: Outcome): boolean {
  const findings = fieldOf(outcome.report, 'findings');
  return (
    outcome.error === undefined &&
    outcome.skippedBecause === undefined &&
    Array.isArray(findings) &&
    findings.every((finding) => fieldOf(finding, 'classification') !== 'tool-error')
  );
}

type Written = { readonly written: true } | { readonly written: false; readonly error: unknown };

function writeAtomically(file: string, text: () => string): Written {
  const temporary = `${file}.${String(process.pid)}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(temporary, text());
    renameSync(temporary, file);
    return { written: true };
  } catch (error) {
    rmSync(temporary, { force: true });
    return { written: false, error };
  }
}

export function checkpointed(
  task: AnalyzerTask,
  outcome: Outcome,
  dependencyOutcomes: readonly Outcome[],
): Outcome {
  const { checkpoint } = task;
  const carried = task.carried ?? [];
  if (
    (checkpoint !== undefined || carried.length > 0) &&
    isClean(outcome) &&
    dependencyOutcomes.every(isClean)
  ) {
    const split = splitByTool(
      outcome.report,
      carried.map(({ name }) => name),
    );
    const parts = [
      { checkpoint, report: split.own },
      ...carried.map((part) => ({
        checkpoint: part.checkpoint,
        report: split.carried.get(part.name),
      })),
    ];
    for (const part of parts) {
      writeCheckpoint(part.checkpoint, part.report);
    }
  }
  return outcome;
}

function writeCheckpoint(checkpoint: TaskCheckpoint | undefined, source: unknown): void {
  if (checkpoint !== undefined) {
    const report = {
      findings: listOf(fieldOf(source, 'findings')),
      moduleImports: fieldOf(source, 'moduleImports'),
    };
    writeAtomically(checkpoint.file, () => cacheEntryText(checkpoint.key, report));
  }
}
