import { describe, expect, it } from 'vitest';
import { cruiseInProcess as cruise } from '../dependency-graph/test-support/in-process-cruise.mts';
import { analyzeEntryPoints } from './typed/typed-analysis.mts';

const fixtureRoot = 'languages/typescript/preset/entry-points/fixtures';
const matching = (pattern: RegExp): unknown => expect.stringMatching(pattern);
const options = { foundationDirectories: new Set<string>() };

describe('production entry-point policy', () => {
  it('accepts public, same-component, and composition-root imports', async () => {
    const sourceRoot = `${fixtureRoot}/allowed/src/main`;
    const report = analyzeEntryPoints(
      await cruise([sourceRoot], { typeScriptRoot: `${fixtureRoot}/allowed` }),
      sourceRoot,
      options,
    );

    expect(report.summary.publicAlternativeBypasses).toBe(0);
    expect(report.summary.unexportedTargetImports).toBe(0);
    expect(report.summary.missingEntryPointImports).toBe(0);
    expect(report.summary.throughEntryPoint).toBe(1);
  });

  it('distinguishes a public bypass from unexported and missing targets', async () => {
    const sourceRoot = `${fixtureRoot}/signals/src/main`;
    const report = analyzeEntryPoints(
      await cruise([sourceRoot], { typeScriptRoot: `${fixtureRoot}/signals` }),
      sourceRoot,
      options,
    );

    expect(report.summary).toEqual({
      productionModules: 7,
      components: 3,
      declaredEntryPoints: 1,
      throughEntryPoint: 0,
      publicAlternativeBypasses: 3,
      unexportedTargetImports: 1,
      missingEntryPointImports: 1,
      concreteCrossBoundaryImports: 1,
    });
    expect(
      [...new Set(report.publicAlternativeBypasses.map((entry) => entry.target))].sort(),
    ).toEqual([
      expect.stringMatching(/beta\/beta-client\.ts$/),
      expect.stringMatching(/beta\/public\.ts$/),
    ]);
    expect(report.publicAlternativeBypasses).toEqual([
      {
        source: `${sourceRoot}/alpha/consumer.ts`,
        target: `${sourceRoot}/beta/beta-client.ts`,
        sourceComponent: 'alpha',
        targetComponent: 'beta',
        dependencyKind: 'runtime',
        publicEntryPoint: `${sourceRoot}/beta/index.ts`,
      },
      {
        source: `${sourceRoot}/alpha/consumer.ts`,
        target: `${sourceRoot}/beta/public.ts`,
        sourceComponent: 'alpha',
        targetComponent: 'beta',
        dependencyKind: 'runtime',
        publicEntryPoint: `${sourceRoot}/beta/index.ts`,
      },
      {
        source: matching(/root-plugin\.ts$/),
        target: matching(/beta\/public\.ts$/),
        sourceComponent: '(root)',
        targetComponent: 'beta',
        dependencyKind: 'runtime',
        publicEntryPoint: `${sourceRoot}/beta/index.ts`,
      },
    ]);
  });

  it('fails visibly for a malformed analyzer graph', () => {
    expect(() => analyzeEntryPoints({}, 'src/main')).toThrow(/modules array/);
  });
});
