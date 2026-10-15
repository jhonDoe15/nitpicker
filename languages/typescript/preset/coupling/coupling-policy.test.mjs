import { describe, expect, it } from 'vitest';
import { cruiseInProcess as cruise } from '../dependency-graph/test-support/in-process-cruise.mjs';
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

    expect(hub).toEqual({
      source: `${sourceRoot}/shared/hub.ts`,
      package: 'shared',
      fanIn: 3,
      fanOut: 1,
      totalCoupling: 4,
      instability: 0.25,
      runtimeFanIn: 3,
      runtimeFanOut: 1,
      runtimeInstability: 0.25,
    });
    expect(alpha).toEqual({
      name: 'alpha',
      modules: 2,
      fanIn: 0,
      fanOut: 1,
      instability: 1,
      cohesion: {
        internalEdges: 0,
        edgeDensity: 0,
        connectedComponents: 2,
        largestComponentShare: 0.5,
      },
    });
    expect(shared).toEqual({
      name: 'shared',
      modules: 2,
      fanIn: 3,
      fanOut: 0,
      instability: 0,
      cohesion: {
        internalEdges: 1,
        edgeDensity: 0.5,
        connectedComponents: 1,
        largestComponentShare: 1,
      },
    });
  });

  it('keeps a cohesive low-signal graph connected without inventing instability', async () => {
    const sourceRoot = `${fixtureRoot}/low-signal/src/main`;
    const report = analyzeCoupling(
      await cruise([sourceRoot], { typeScriptRoot: `${fixtureRoot}/low-signal` }),
      sourceRoot,
    );

    expect(report.summary).toEqual({
      modules: 2,
      dependencies: 1,
      runtimeDependencies: 1,
      typeOnlyDependencies: 0,
      packages: 1,
    });
    expect(report.packages[0].cohesion).toEqual({
      internalEdges: 1,
      edgeDensity: 0.5,
      connectedComponents: 1,
      largestComponentShare: 1,
    });
    expect(report.stabilityDirection).toEqual([]);
  });

  it('does not report a type-only import as a stability inversion but counts it in instability', () => {
    const module = (name, ...dependencies) => ({
      source: `src/main/${name}.ts`,
      dependencies: dependencies.map(([target, dependencyTypes]) => ({
        resolved: `src/main/${target}.ts`,
        dependencyTypes,
      })),
    });
    const graphWith = (types) => ({
      modules: [
        module('p1/a', ['stable/s', ['local']]),
        module('p2/a', ['stable/s', ['local']]),
        module('stable/s', ['volatile/v', types]),
        module('volatile/v', ['leaf/q', ['local']]),
        module('leaf/q'),
      ],
    });

    const runtime = analyzeCoupling(graphWith(['local']), 'src/main');
    const typeOnly = analyzeCoupling(graphWith(['type-only']), 'src/main');

    expect(runtime.stabilityDirection.map(({ source, target }) => [source, target])).toEqual([
      ['stable', 'volatile'],
    ]);
    expect(typeOnly.stabilityDirection).toEqual([]);
    expect(typeOnly.packages).toEqual(runtime.packages);
  });

  it('fails visibly for a malformed analyzer graph', () => {
    expect(() => analyzeCoupling({ modules: null }, 'src/main')).toThrow(/modules array/);
  });
});
