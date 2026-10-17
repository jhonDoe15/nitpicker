import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../contained-path.mjs';

const FAKE_PROGRAM = containedPath(
  path.resolve(import.meta.dirname, '..'),
  'fixtures/fake-package-manager.sh',
);
const EXECUTABLE = 0o755;

export function installFakeManagers(binDirectory, names = ['npm', 'pnpm', 'yarn', 'bun']) {
  mkdirSync(binDirectory, { recursive: true });
  for (const name of names) {
    const script = containedPath(binDirectory, name);
    writeFileSync(script, `#!/bin/sh\nexec sh "${FAKE_PROGRAM}" ${name} "$@"\n`);
    chmodSync(script, EXECUTABLE);
  }
  return binDirectory;
}
