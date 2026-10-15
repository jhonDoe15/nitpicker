import {
  expectedOutput22_30,
  expectedOutput35_27,
} from '../../../../core/diff/fixtures/expected-output/languages-typescript-preset-architecture-architecture-rules.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cruiseWithConfig } from './fixtures/strict-cruise.mjs';
import config from './fixtures/dependency-cruiser.fixture.config.mjs';
import productionConfig from '../defaults/dependency-cruiser.config.mjs';

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
  it('runs the fixtures against every rule of the shipped dependency-cruiser config', () => {
    expect(productionConfig.forbidden.length).toBeGreaterThan(0);
    expect(config.forbidden).toEqual(expectedOutput22_30());
  });

  it('accepts the allowed dependency direction', async () => {
    const result = await cruiseFixture('allowed-direction');

    expect(result.exitCode, result.output).toBe(0);
  });

  it('rejects the reverse dependency direction', async () => {
    const result = await cruiseFixture('reverse-direction');

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toEqual(expectedOutput35_27());
  });
});
