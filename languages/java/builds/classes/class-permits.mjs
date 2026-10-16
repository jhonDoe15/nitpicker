import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { classSummaries, classSummary } from './class-summary.mjs';

function permitsLines({ name, permitted }) {
  return permitted.map(
    (subclass) => `${name.replaceAll('/', '.')} -> ${subclass.replaceAll('/', '.')}`,
  );
}

export function permittedSubclasses(buffer) {
  return permitsLines(classSummary(buffer));
}

export function runPermits({ classDirectories, reportDir }) {
  const lines = classSummaries(classDirectories).flatMap(permitsLines);
  writeFileSync(path.join(reportDir, 'permits.txt'), lines.map((line) => `${line}\n`).join(''));
}
