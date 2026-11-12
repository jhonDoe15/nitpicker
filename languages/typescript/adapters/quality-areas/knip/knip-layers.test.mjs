import { describe, expect, it } from 'vitest';
import { layeredKnipConfig, writtenKnipConfig } from './knip-layers.mjs';

const NITPICKER = {
  $schema: 'nitpicker',
  entry: ['src/main.ts'],
  project: ['src/**/*.ts'],
  ignore: ['coverage/**'],
  ignoreDependencies: ['vitest'],
};
const PROJECT = {
  $schema: 'project',
  entry: 'scripts/build.ts',
  project: ['**/*.ts', '!src/vendor/**'],
  ignore: 'src/legacy/**',
  ignoreDependencies: ['left-pad'],
  ignoreBinaries: ['make'],
  ignoreIssues: { 'src/a.ts': ['exports'] },
  paths: { '@/*': ['src/*'] },
  rules: { exports: 'off' },
  ignoreExportsUsedInFile: true,
  eslint: false,
  treatConfigHintsAsErrors: true,
};

function layered(precedence, project = PROJECT, nitpicker = NITPICKER) {
  return layeredKnipConfig(nitpicker, { precedence, config: project });
}

describe('layered knip config', () => {
  it('keeps the nitpicker config alone without a project layer', () => {
    expect(layeredKnipConfig(NITPICKER, undefined)).toBe(NITPICKER);
  });

  const ADDED = {
    $schema: 'nitpicker',
    entry: ['src/main.ts', 'scripts/build.ts'],
    project: ['src/**/*.ts', '!src/vendor/**'],
    ignore: ['coverage/**', 'src/legacy/**'],
    ignoreDependencies: ['vitest', 'left-pad'],
    ignoreBinaries: ['make'],
    ignoreIssues: { 'src/a.ts': ['exports'] },
    paths: { '@/*': ['src/*'] },
    eslint: false,
  };
  const PROJECT_FIRST = { ...ADDED, rules: { exports: 'off' }, ignoreExportsUsedInFile: true };

  it('adds the project entries, ignores and negated project patterns under every ordering', () => {
    expect(layered(['project'])).toEqual(PROJECT_FIRST);
    expect(layered(['project', 'nitpicker'])).toEqual(PROJECT_FIRST);
    expect(layered(['nitpicker', 'project'])).toEqual(ADDED);
  });

  it('ranks plugin and path settings both sides set by the precedence', () => {
    const nitpicker = { ...NITPICKER, vitest: false, paths: { '@/*': ['lib/*'] } };
    const project = { vitest: { entry: ['x.ts'] }, paths: { '@/*': ['src/*'] } };
    expect(layered(['project', 'nitpicker'], project, nitpicker)).toEqual({
      ...NITPICKER,
      ...project,
    });
    expect(layered(['nitpicker', 'project'], project, nitpicker)).toEqual(nitpicker);
  });

  it('merges ignored issue types per pattern', () => {
    const nitpicker = { ...NITPICKER, ignoreIssues: { 'src/a.ts': ['types'] } };
    expect(layered(['project'], PROJECT, nitpicker).ignoreIssues).toEqual({
      'src/a.ts': ['types', 'exports'],
    });
  });

  it('folds the root workspace into the root and keeps the nested workspaces', () => {
    const project = {
      workspaces: {
        '.': { ignore: ['src/old/**'] },
        'packages/*': { entry: ['src/cli.ts'] },
      },
    };
    const config = layered(['project', 'nitpicker'], project);
    expect(config.ignore).toEqual(['coverage/**', 'src/old/**']);
    expect(config.workspaces).toEqual({ 'packages/*': { entry: ['src/cli.ts'] } });
    expect(writtenKnipConfig({ ...config, vitest: false }).workspaces).toEqual({
      '.': {
        entry: config.entry,
        project: config.project,
        ignore: config.ignore,
        ignoreDependencies: config.ignoreDependencies,
        vitest: false,
      },
      'packages/*': { entry: ['src/cli.ts'] },
    });
    expect(writtenKnipConfig(NITPICKER)).toBe(NITPICKER);
  });
});
