import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

export function tracedWorktrees(
  temporaryRoot: (prefix: string) => string,
  worktreeLine: RegExp,
): () => string[] {
  const file = path.join(temporaryRoot('nitpicker-git-trace-'), 'trace.txt');
  writeFileSync(file, '');
  vi.stubEnv('GIT_TRACE', file);
  return () =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => worktreeLine.test(line));
}
