import { describe, expect, it } from 'vitest';
import { cruiseInProcess as cruise } from '../dependency-graph/fixtures/in-process-cruise.mjs';
import { analyzeCoupling } from './analyze.mjs';

const fixtureRoot = 'preset/coupling/fixtures';

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

    expect(hub).toMatchObject({ fanIn: 3, fanOut: 1, totalCoupling: 4, instability: 0.25 });
    expect(alpha).toMatchObject({ modules: 2, fanIn: 0, fanOut: 1, instability: 1 });
    expect(alpha.cohesion).toMatchObject({ connectedComponents: 2, largestComponentShare: 0.5 });
    expect(shared).toMatchObject({ modules: 2, fanIn: 3, fanOut: 0, instability: 0 });
    expect(shared.cohesion).toMatchObject({ connectedComponents: 1, largestComponentShare: 1 });
  });

  it('keeps a cohesive low-signal graph connected without inventing instability', async () => {
    const sourceRoot = `${fixtureRoot}/low-signal/src/main`;
    const report = analyzeCoupling(
      await cruise([sourceRoot], { typeScriptRoot: `${fixtureRoot}/low-signal` }),
      sourceRoot,
    );

    expect(report.summary).toMatchObject({ modules: 2, dependencies: 1, packages: 1 });
    expect(report.packages[0].cohesion).toMatchObject({
      connectedComponents: 1,
      largestComponentShare: 1,
    });
    expect(report.stabilityDirection).toEqual([]);
  });

  it('fails visibly for a malformed analyzer graph', () => {
    expect(() => analyzeCoupling({ modules: null }, 'src/main')).toThrow(/modules array/);
  });
});
