import { cpSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { containedPath } from '../contained-path.mts';

const FIXTURES = containedPath(path.resolve(import.meta.dirname, '..'), 'fixtures');
const PROBE_TIMEOUT_MS = 20_000;

export function copyProjectFixture(name: string, destination: string): string {
  cpSync(containedPath(FIXTURES, `projects/${name}`), destination, { recursive: true });
  const vendor = containedPath(destination, 'vendor');
  mkdirSync(vendor, { recursive: true });
  cpSync(containedPath(FIXTURES, 'fixture-lib'), containedPath(vendor, 'fixture-lib'), {
    recursive: true,
  });
  return destination;
}

export function managerVersion(binary: string, fixtureName: string): string {
  const result = spawnSync(binary, ['--version'], {
    cwd: containedPath(FIXTURES, `projects/${fixtureName}`),
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}
