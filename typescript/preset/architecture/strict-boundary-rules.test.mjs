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
  'preset/architecture/fixtures/dependency-cruiser.strict.fixture.config.mjs',
);

function cruiseFixture(name) {
  const fixture = path.join(projectRoot, 'preset/architecture/fixtures/strict', name);
  return spawnSync(
    process.execPath,
    [dependencyCruiser, fixture, '--config', config, '--output-type', 'err-long'],
    { cwd: projectRoot, encoding: 'utf8' },
  );
}

// Each violation: fixture directory, the rule that must fire, and the allowed form its message names.
const violations = [
  [
    'internal-import-from-feature',
    'features-do-not-import-other-feature-internals',
    'public index.ts',
  ],
  ['internal-import-from-shared', 'feature-internals-only-through-index', 'public index.ts'],
  [
    'shared-imports-feature',
    'shared-does-not-import-features',
    'parameter from the composition root',
  ],
  ['feature-imports-composition-root', 'features-do-not-import-composition-root', 'as a parameter'],
  ['domain-imports-adapters', 'domain-does-not-import-adapters', 'adapters/ implement it'],
  ['domain-imports-node-io', 'domain-does-not-import-node-io', 'only pure Node modules'],
  ['domain-imports-client', 'domain-does-not-import-network-or-database-clients', 'from adapters/'],
  ['domain-imports-logger', 'domain-does-not-import-the-logger', 'adapters/ log it'],
  [
    'domain-imports-state',
    'domain-does-not-import-module-state',
    'Receive the state as a parameter',
  ],
  ['import-cycle', 'no-production-cycles', null],
];

describe('strict boundary rules', () => {
  it('accepts the allowed layout', () => {
    const result = cruiseFixture('allowed');

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it.each(violations)('rejects %s', (fixture, rule, allowedForm) => {
    const result = cruiseFixture(fixture);
    const output = (result.stderr + result.stdout).replaceAll(/\s+/g, ' ');

    expect(result.status).not.toBe(0);
    expect(output).toContain(rule);
    if (allowedForm !== null) expect(output).toContain(allowedForm);
  });
});
