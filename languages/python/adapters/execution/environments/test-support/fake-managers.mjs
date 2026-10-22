import { chmodSync, writeFileSync } from 'node:fs';

const EXECUTABLE = 0o755;

export function installFakeManager(target, { output = '', status = 0, error = '' }) {
  const script = [
    '#!/bin/sh',
    `echo '${output}'`,
    `echo '${error}' >&2`,
    `exit ${String(status)}`,
  ].join('\n');
  writeFileSync(target, `${script}\n`);
  chmodSync(target, EXECUTABLE);
}
