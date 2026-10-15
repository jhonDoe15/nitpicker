import {
  expectedOutput18_17,
  expectedOutput19_19,
  expectedOutput20_28,
  expectedOutput21_20,
  expectedOutput22_29,
  expectedOutput32_28,
  expectedOutput33_41,
} from '../../../../core/diff/fixtures/expected-output/languages-typescript-preset-coupling-coupling-policy.mjs';
import { describe, expect, it } from 'vitest';
import { cruiseInProcess as cruise } from '../dependency-graph/fixtures/in-process-cruise.mjs';
import { analyzeCoupling } from './analyze.mjs';

const fixtureRoot = 'languages/typescript/preset/coupling/fixtures';

describe('coupling report', () => {
  it('reports a dependency hub and unstable consumers', async () => {
    const sourceRoot = `${fixtureRoot}/signal/src/main`;
    const report = analyzeCoupling(
      await cruise([sourceRoot], { typeScriptRoot: `${fixtureRoot}/signal` }),
      sourceRoot,
    );
    const hub = report.modules.find((entry) => entry.source.endsWith('/shared/hub.ts'));
    const alpha = report.packages.find((entry) => entry.name === 'alpha');
    const shared = report.packages.find((entry) => entry.name === 'shared');

    expect(hub).toEqual(expectedOutput18_17({ sourceRoot }));
    expect(alpha).toEqual(expectedOutput19_19());
    expect(alpha.cohesion).toEqual(expectedOutput20_28());
    expect(shared).toEqual(expectedOutput21_20());
    expect(shared.cohesion).toEqual(expectedOutput22_29());
  });

  it('keeps a cohesive low-signal graph connected without inventing instability', async () => {
    const sourceRoot = `${fixtureRoot}/low-signal/src/main`;
    const report = analyzeCoupling(
      await cruise([sourceRoot], { typeScriptRoot: `${fixtureRoot}/low-signal` }),
      sourceRoot,
    );

    expect(report.summary).toEqual(expectedOutput32_28());
    expect(report.packages[0].cohesion).toEqual(expectedOutput33_41());
    expect(report.stabilityDirection).toEqual([]);
  });

  it('fails visibly for a malformed analyzer graph', () => {
    expect(() => analyzeCoupling({ modules: null }, 'src/main')).toThrow(/modules array/);
  });
});
