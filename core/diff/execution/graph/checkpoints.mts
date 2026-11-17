import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cacheEntryText } from '../../cache/entries/cache-entry.mts';
import type { AnalyzerTask } from '../tasks.mts';
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
  if (checkpoint !== undefined && isClean(outcome) && dependencyOutcomes.every(isClean)) {
    const report = {
      findings: listOf(fieldOf(outcome.report, 'findings')),
      moduleImports: fieldOf(outcome.report, 'moduleImports'),
    };
    writeAtomically(checkpoint.file, () => cacheEntryText(checkpoint.key, report));
  }
  return outcome;
}
