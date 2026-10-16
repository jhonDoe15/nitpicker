import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FAKE_PROGRAM = path.join(import.meta.dirname, '../fixtures/fake-package-manager.mjs');

export function installFakeManagers(binDirectory, names = ['npm', 'pnpm', 'yarn', 'bun']) {
  mkdirSync(binDirectory, { recursive: true });
  for (const name of names) {
    const script = path.join(binDirectory, name);
    writeFileSync(script, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_PROGRAM}" ${name} "$@"\n`);
    chmodSync(script, 0o755);
  }
  return binDirectory;
}
