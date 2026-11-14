import { chmodSync, writeFileSync } from 'node:fs';

const EXECUTABLE = 0o755;

export function installFakeManager(
  target: string,
  { output = '', status = 0, error = '' }: { output?: string; status?: number; error?: string },
): void {
  const script = [
    '#!/bin/sh',
    `echo '${output}'`,
    `echo '${error}' >&2`,
    `exit ${String(status)}`,
  ].join('\n');
  writeFileSync(target, `${script}\n`);
  chmodSync(target, EXECUTABLE);
}
