import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectLayerValue } from './project-layer.mjs';
import { projectEntries } from './project-loader.mjs';
import { temporaryProjects } from './test-support/layered-project.mjs';

const projects = temporaryProjects();

afterAll(() => {
  projects.remove();
});

function loaded(file, text, extra = {}) {
  const root = projects.create({ [file]: text, ...extra });
  return projectEntries(path.join(root, file));
}

describe('loading the ESLint project config', () => {
  it.each([
    [
      'eslint.config.mjs',
      'export default [{ rules: {',
      'ESLint config eslint.config.mjs could not be loaded:',
    ],
    [
      'eslint.config.mjs',
      'export default 42;',
      'ESLint config eslint.config.mjs must export a flat config array or object',
    ],
    [
      'eslint.config.mjs',
      "export default [{ name: 'house', rules: {}, overrides: [] }];",
      'ESLint config eslint.config.mjs is not a valid flat config: Config "house": Unexpected key "overrides" found.',
    ],
    [
      'eslint.config.cjs',
      'module.exports = { default: [{ rules: {} }] };',
      'ESLint config eslint.config.cjs is not a valid flat config: Config (unnamed): Unexpected key "default" found.',
    ],
  ])('rejects %s holding %s', async (file, text, message) => {
    await expect(loaded(file, `${text}\n`)).rejects.toThrow(message);
  });

  it('loads a TypeScript config through the jiti installed next to nitpicker when the project has none', async () => {
    const entries = await loaded(
      'eslint.config.mts',
      "const severity: 'error' = 'error';\nexport default [{ rules: { eqeqeq: severity } }];\n",
    );

    expect(entries).toEqual([{ rules: { eqeqeq: 'error' } }]);
  });

  it('passes over a project jiti without createJiti, such as jiti 1', async () => {
    const entries = await loaded(
      'eslint.config.cts',
      "const severity: 'warn' = 'warn';\nexport default [{ rules: { curly: severity } }];\n",
      {
        'node_modules/jiti/package.json': JSON.stringify({
          name: 'jiti',
          version: '1.21.7',
          main: 'index.js',
        }),
        'node_modules/jiti/index.js':
          'module.exports = function jiti() { throw new Error("jiti 1"); };\n',
      },
    );

    expect(entries).toEqual([{ rules: { curly: 'warn' } }]);
  });
});

describe('the layer handed to the lint processes', () => {
  it.each([[['project']], [['nitpicker', 'project']]])(
    'is a tool error without the config when the precedence is %j',
    (precedence) => {
      expect(() =>
        projectLayerValue(
          { precedence, projectConfigMissing: true },
          { liveProjectRoot: '/repo', addsRules: true },
        ),
      ).toThrow(
        '"tools.eslint.precedence" lists "project" but an ESLint flat config at the project root (eslint.config.js, eslint.config.mjs, eslint.config.cjs, eslint.config.ts, eslint.config.mts, eslint.config.cts) is missing: create it, or remove "project" from tools.eslint.precedence',
      );
    },
  );

  it('names the head config, the order and whether rules are added, the same for a lone "project", or nothing without an opt-in', () => {
    const settings = (precedence) => ({ precedence, projectConfigFile: 'eslint.config.ts' });

    expect(
      JSON.parse(
        projectLayerValue(settings(['nitpicker', 'project']), {
          liveProjectRoot: '/repo',
          addsRules: false,
        }),
      ),
    ).toEqual({
      config: path.join('/repo', 'eslint.config.ts'),
      nitpickerFirst: true,
      addsRules: false,
    });
    expect(
      projectLayerValue(settings(['nitpicker']), { liveProjectRoot: '/repo', addsRules: true }),
    ).toBe('');
    expect(projectLayerValue(undefined, { liveProjectRoot: '/repo', addsRules: true })).toBe('');
    expect(
      projectLayerValue(settings(['project']), { liveProjectRoot: '/repo', addsRules: true }),
    ).toBe(
      projectLayerValue(settings(['project', 'nitpicker']), {
        liveProjectRoot: '/repo',
        addsRules: true,
      }),
    );
  });
});
