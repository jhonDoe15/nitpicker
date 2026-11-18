import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { explainedError } from '../../../../shared/messages/troubleshooting.mjs';
import { fieldOf, messageOf } from '../../../../shared/values/readers.mts';

type SkipRequest = {
  readonly reportDir: string;
  readonly file: string;
  readonly placeholders?: Readonly<Record<string, string>>;
};

export function noFittingJdk(problem: string): Error {
  return Object.defineProperty(explainedError(problem), 'noFittingJdk', { value: true });
}

export function isNoFittingJdk(error: unknown): boolean {
  return fieldOf(error, 'noFittingJdk') === true;
}

function writeReport(reportDir: string, name: string, content: string): void {
  const full = path.resolve(reportDir, name);
  if (!full.startsWith(path.resolve(reportDir) + path.sep)) {
    throw new Error(`${name} is outside the report directory ${reportDir}`);
  }
  writeFileSync(full, content);
}

export function skipWithoutJdk(
  { reportDir, file, placeholders = {} }: SkipRequest,
  action: () => void,
): void {
  try {
    action();
  } catch (error) {
    if (!isNoFittingJdk(error)) {
      throw error;
    }
    writeReport(reportDir, file, `${messageOf(error)}\n`);
    for (const [name, content] of Object.entries(placeholders)) {
      writeReport(reportDir, name, content);
    }
  }
}
