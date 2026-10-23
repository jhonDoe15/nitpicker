import { describe, expect, it } from 'vitest';
import {
  layeredDependencyCruiserConfig,
  projectExcludePaths,
} from './dependency-cruiser-layers.mjs';

const POLICY = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: { path: '^src' }, to: { circular: true } },
    { severity: 'error', from: { path: '^src/a' }, to: { path: '^src/z' } },
  ],
  required: [],
  options: {
    preserveSymlinks: true,
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.quality.json' },
    tsPreCompilationDeps: 'specify',
    enhancedResolveOptions: { extensions: ['.ts', '.js'] },
  },
};
const PROJECT = {
  forbidden: [
    { name: 'no-cycles', severity: 'warn', comment: 'Ours' },
    { name: 'a-not-b', severity: 'error', from: { path: '^src/a' }, to: { path: '^src/b' } },
    { severity: 'error', from: { path: '^src/a' }, to: { path: '^src/z' } },
  ],
  required: [{ name: 'needs-c', severity: 'info', module: { path: '^src/a' }, to: { path: 'c' } }],
  allowed: [{ from: {}, to: {} }],
  allowedSeverity: 'warn',
  options: {
    exclude: { path: ['^src/legacy', '^src/old'] },
    doNotFollow: { path: ['^vendor'], dependencyTypes: ['npm'] },
    includeOnly: '^src/b',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: false,
    moduleSystems: ['cjs'],
    combinedDependencies: true,
    enhancedResolveOptions: { extensions: ['.vue'], conditionNames: ['import'] },
  },
};

function layered(precedence, project = PROJECT) {
  return layeredDependencyCruiserConfig(POLICY, { precedence, config: project });
}

describe('layered dependency-cruiser config', () => {
  it('keeps the policy config alone without a project layer', () => {
    expect(layeredDependencyCruiserConfig(POLICY, undefined)).toBe(POLICY);
    expect(projectExcludePaths(undefined)).toEqual([]);
  });

  it('lays a project rule over the nitpicker rule of its name when the project comes first', () => {
    const config = layered(['project', 'nitpicker']);
    expect(config.forbidden).toEqual([
      { ...POLICY.forbidden[0], severity: 'warn', comment: 'Ours' },
      PROJECT.forbidden[1],
      POLICY.forbidden[1],
    ]);
    expect(layered(['project'])).toEqual(config);
    expect(config.required).toEqual(PROJECT.required);
    expect(config).toMatchObject({ allowed: PROJECT.allowed, allowedSeverity: 'warn' });
  });

  it('keeps the nitpicker values of a shared rule when nitpicker comes first', () => {
    expect(layered(['nitpicker', 'project']).forbidden[0]).toEqual({
      ...POLICY.forbidden[0],
      comment: 'Ours',
    });
  });

  it('keeps the options nitpicker relies on and adds the project exclusions', () => {
    for (const precedence of [['project'], ['nitpicker', 'project']]) {
      const { options } = layered(precedence);
      expect(options).toEqual({
        preserveSymlinks: true,
        doNotFollow: { path: 'node_modules|^vendor', dependencyTypes: ['npm'] },
        tsConfig: { fileName: 'tsconfig.quality.json' },
        tsPreCompilationDeps: 'specify',
        combinedDependencies: true,
        enhancedResolveOptions: { extensions: ['.ts', '.js'], conditionNames: ['import'] },
      });
    }
    expect(projectExcludePaths({ config: PROJECT })).toEqual(['^src/legacy', '^src/old']);
    expect(projectExcludePaths({ config: { options: { exclude: '^dist' } } })).toEqual(['^dist']);
  });
});
