import { cpSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const FIXTURES = path.join(import.meta.dirname, '../fixtures');

export function copyProjectFixture(name, destination) {
  cpSync(path.join(FIXTURES, 'projects', name), destination, { recursive: true });
  const vendor = path.join(destination, 'vendor');
  mkdirSync(vendor, { recursive: true });
  cpSync(path.join(FIXTURES, 'fixture-lib'), path.join(vendor, 'fixture-lib'), {
    recursive: true,
  });
  return destination;
}

export function projectFixtureDirectory(name) {
  return path.join(FIXTURES, 'projects', name);
}

export function managerVersion(binary, fixtureName) {
  const result = spawnSync(binary, ['--version'], {
    cwd: projectFixtureDirectory(fixtureName),
    encoding: 'utf8',
    timeout: 120_000,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}
