import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unmutatedFailures } from './pit-skipped.mts';
import { fieldOf, optionalText } from '../../../../shared/values/readers.mts';

const RETRY_STOPPED_FILE = 'retry-stopped.txt';

function testClasses(output: string): string {
  return [...new Set(unmutatedFailures(output).map(({ testClass }) => testClass))]
    .toSorted()
    .join('\n');
}

export function writeRetryStopped(pitDir: string, output: string): void {
  writeFileSync(path.join(pitDir, RETRY_STOPPED_FILE), output);
}

function basePitDirectory(pitDir: string, history: unknown): string | undefined {
  const baselineRoot = optionalText(fieldOf(history, 'baselineRoot'));
  const projectRoot = optionalText(fieldOf(history, 'projectRoot'));
  if (
    fieldOf(history, 'snapshot') !== 'head' ||
    baselineRoot === undefined ||
    projectRoot === undefined
  ) {
    return undefined;
  }
  const relative = path.relative(projectRoot, pitDir);
  const outside = relative.startsWith('..') || path.isAbsolute(relative);
  return outside ? undefined : path.join(baselineRoot, relative);
}

export function baseRetryStopped(pitDir: string, history: unknown, output: string): boolean {
  const base = basePitDirectory(pitDir, history);
  const file = base === undefined ? undefined : path.join(base, RETRY_STOPPED_FILE);
  if (file === undefined || !existsSync(file)) {
    return false;
  }
  const failing = testClasses(output);
  return failing !== '' && testClasses(readFileSync(file, 'utf8')) === failing;
}
