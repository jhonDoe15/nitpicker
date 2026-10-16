import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function installFakeManager(binDirectory, name, { output = '', status = 0, error = '' }) {
  mkdirSync(binDirectory, { recursive: true });
  const target = path.join(binDirectory, name);
  const script = [
    '#!/bin/sh',
    `echo '${output}'`,
    `echo '${error}' >&2`,
    `exit ${String(status)}`,
  ].join('\n');
  writeFileSync(target, `${script}\n`);
  chmodSync(target, 0o755);
}
