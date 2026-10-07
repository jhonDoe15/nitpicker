import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dependencyCruiser = path.join(
  projectRoot,
  'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
);
const config = path.join(
  projectRoot,
  'preset/architecture/fixtures/dependency-cruiser.fixture.config.mjs',
);

function cruiseFixture(name) {
  const fixture = path.join(projectRoot, 'preset/architecture/fixtures', name);
  return spawnSync(
    process.execPath,
    [dependencyCruiser, fixture, '--config', config, '--output-type', 'err-long'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );
}

describe('dependency architecture rules', () => {
  it('accepts the allowed dependency direction', () => {
    const result = cruiseFixture('allowed-direction');

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('rejects the reverse dependency direction', () => {
    const result = cruiseFixture('reverse-direction');

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('features-do-not-import-bootstrap');
  });
});
