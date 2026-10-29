import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { TYPESCRIPT_CONFIG_ENVIRONMENT } from '../../../preset/dependency-graph/cruise.mjs';
import { isDependencyCruiserOwnedOption } from '../../../preset/project-tools/config-values.mjs';
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

const MERGED_OPTIONS = new Set(['doNotFollow', 'enhancedResolveOptions']);

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    expect(config).toEqual({
      forbidden: [
        { ...POLICY.forbidden[0], severity: 'warn', comment: 'Ours' },
        PROJECT.forbidden[1],
        POLICY.forbidden[1],
      ],
      required: PROJECT.required,
      allowed: PROJECT.allowed,
      allowedSeverity: 'warn',
      options: {
        ...POLICY.options,
        combinedDependencies: true,
        doNotFollow: { path: 'node_modules|^vendor', dependencyTypes: ['npm'] },
        enhancedResolveOptions: { extensions: ['.ts', '.js'], conditionNames: ['import'] },
      },
    });
    expect(layered(['project'])).toEqual(config);
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

  it('reads regular expressions in the project exclusions as their sources', () => {
    const regExp = (source) => ({ $nitpickerRegExp: [source, 'u'] });
    const project = {
      options: {
        exclude: { path: [regExp('^gen'), '^old'] },
        doNotFollow: { path: regExp('^vendor') },
      },
    };
    expect(projectExcludePaths({ config: project })).toEqual(['^gen', '^old']);
    expect(projectExcludePaths({ config: { options: { exclude: regExp('^dist') } } })).toEqual([
      '^dist',
    ]);
    const revived = { options: { doNotFollow: [/^vendor/u, /^lib/u] } };
    expect(layered(['project'], revived).options.doNotFollow).toEqual({
      path: 'node_modules|^vendor|^lib',
    });
  });

  it('keeps every option nitpicker sets in its config or on the command line', async () => {
    vi.stubEnv(TYPESCRIPT_CONFIG_ENVIRONMENT, path.join(PACKAGE_ROOT, 'package.json'));
    const { default: policy } =
      await import('../../../preset/dependency-graph/dependency-cruiser.config.mjs');
    const graphSource = readFileSync(
      path.join(import.meta.dirname, '../project-dependency-graph.mjs'),
      'utf8',
    );
    const flags = [...graphSource.matchAll(/'--([a-z-]+)'/gu)]
      .map(([, flag]) => flag.replaceAll(/-([a-z])/gu, (_match, letter) => letter.toUpperCase()))
      .filter((option) => option !== 'config');
    const set = [
      ...Object.keys(policy.options).filter((key) => !MERGED_OPTIONS.has(key)),
      ...flags,
    ];
    expect(flags.toSorted()).toEqual(['exclude', 'includeOnly', 'outputType']);
    expect(set.filter((option) => !isDependencyCruiserOwnedOption(option))).toEqual([]);
  });
});
