import { readFileSync } from 'node:fs';
import { parseJson } from '../../../../../shared/values/readers.mts';

type RecordedRun = { command: readonly string[]; options: unknown; request: unknown };

export function recordingRun(stdout: string): {
  calls: RecordedRun[];
  run: (context: unknown, command: readonly string[], options: unknown) => { stdout: string };
} {
  const calls: RecordedRun[] = [];
  function run(_: unknown, command: readonly string[], options: unknown): { stdout: string } {
    calls.push({
      command,
      options,
      request: parseJson(readFileSync(command.at(-1) ?? '', 'utf8')),
    });
    return { stdout };
  }
  return { calls, run };
}
