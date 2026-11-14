import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { classSummaries, classSummary } from './class-summary.mjs';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type PermitsRun = { readonly classDirectories: unknown; readonly reportDir: string };

function permitsLines(summary: unknown): string[] {
  const name = textOf(fieldOf(summary, 'name')).replaceAll('/', '.');
  const usedMembers = fieldOf(summary, 'usedMembers');
  return textsOf(fieldOf(summary, 'permitted'))
    .filter((subclass) => !(usedMembers instanceof Set && usedMembers.has(subclass)))
    .map((subclass) => `${name} -> ${subclass.replaceAll('/', '.')}`);
}

export function permittedSubclasses(buffer: Buffer): string[] {
  return permitsLines(classSummary(buffer));
}

export function runPermits({ classDirectories, reportDir }: PermitsRun): void {
  const summaries: unknown = classSummaries(classDirectories);
  const lines = (Array.isArray(summaries) ? summaries : []).flatMap((summary: unknown) =>
    permitsLines(summary),
  );
  writeFileSync(path.join(reportDir, 'permits.txt'), lines.map((line) => `${line}\n`).join(''));
}
