import { readFile } from 'node:fs/promises';
import { runReport } from './features/report/index.js';
import { runGreeting } from './features/greeting/index.js';

export { runReport };

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export function reportMain(argv: readonly string[]): Promise<number> {
  return runReport(argv, {
    readFile: (path) => readFile(path, 'utf8'),
    stdout: { write: (text) => process.stdout.write(text) },
    stderr: { write: (text) => process.stderr.write(text) },
  });
}
