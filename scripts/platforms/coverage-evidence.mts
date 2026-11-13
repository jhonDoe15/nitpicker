import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldsOf } from '../json/fields.mts';
import { containedPath } from '../../core/fix/common/contained-path.mjs';
import type { PlatformRun } from './smoke.mts';

const SNAPSHOTS = ['base', 'head'] as const;

function coverageKeys(file: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return Object.keys(fieldsOf(parsed) ?? {});
}

function fileOf(parts: unknown): unknown {
  if (!Array.isArray(parts)) {
    return '';
  }
  const entries: unknown[] = parts;
  return entries[2];
}

function differingFiles(reference: PlatformRun, run: PlatformRun): string[] {
  const expected = new Set(reference.change.findings);
  const actual = new Set(run.change.findings);
  const keys = [...expected, ...actual].filter((key) => expected.has(key) !== actual.has(key));
  const files = keys.map((key): unknown => JSON.parse(key)).map(fileOf);
  return [
    ...new Set(files.filter((file): file is string => typeof file === 'string' && file !== '')),
  ];
}

export function coverageEvidenceNotes(
  directory: string,
  reference: PlatformRun,
  run: PlatformRun,
): string[] {
  const { sample } = run;
  const files = differingFiles(reference, run);
  const evidence = containedPath(directory, `${sample}-reports/coverage-evidence/change`);
  return SNAPSHOTS.flatMap((snapshot) => {
    const file = containedPath(evidence, `${snapshot}-coverage-final.json`);
    if (!existsSync(file)) {
      return [`coverage evidence: no ${snapshot} coverage report kept for ${sample}`];
    }
    const keys = coverageKeys(file);
    return files.map((name) => {
      const wanted = path.posix.basename(name).toLowerCase();
      const matching = keys.filter((key) =>
        key.replaceAll('\\', '/').toLowerCase().endsWith(wanted),
      );
      return `coverage evidence: ${sample} ${snapshot} keys for ${name}: ${JSON.stringify(matching)} of ${String(keys.length)} files`;
    });
  });
}
