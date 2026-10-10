import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cruiseWithConfig } from './fixtures/strict-cruise.mjs';
import config from './fixtures/dependency-cruiser.fixture.config.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function cruiseFixture(name) {
  const fixture = path.join(projectRoot, 'languages/typescript/preset/architecture/fixtures', name);
  return cruiseWithConfig(config, {
    baseDir: projectRoot,
    paths: [fixture],
    outputType: 'err-long',
  });
}

describe('dependency architecture rules', () => {
  it('accepts the allowed dependency direction', async () => {
    const result = await cruiseFixture('allowed-direction');

    expect(result.exitCode, result.output).toBe(0);
  });

  it('rejects the reverse dependency direction', async () => {
    const result = await cruiseFixture('reverse-direction');

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('features-do-not-import-bootstrap');
  });
});
