import { describe, expect, it } from 'vitest';
import { lintRule } from '../model/lint-rule.mjs';
import { withProject } from '../model/project-model.mjs';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { fileNameCasingRecipe as recipe } from './file-name-casing.mjs';

const projects = useFixtureProjects();
const RULE = 'eslint/nitpicker/file-name-casing';

function remaining(result, name) {
  const context = {
    projectRoot: result.projectRoot,
    files: [{ path: name }],
    read: (file) => result.tree[file],
  };
  return withProject(context, (project) =>
    lintRule(project, name, { ruleId: 'file-name-casing', options: [{ casing: 'kebab-case' }] }),
  );
}

describe('fileNameCasingRecipe', () => {
  it('is a review recipe of project scope for both presets', () => {
    expect([recipe.presets, recipe.safety, recipe.scope, recipe.rules]).toEqual([
      ['typescript', 'javascript'],
      'review',
      'project',
      [{ tool: 'eslint', rule: 'nitpicker/file-name-casing' }],
    ]);
  });

  it('renames the file and rewrites the imports of its importers and its own', () => {
    const result = projects.fix(
      {
        'src/userService.ts': "import { base } from './base.js';\nexport const user = base;\n",
        'src/base.ts': 'export const base = 1;\n',
        'src/use.ts': "import { user } from './userService.js';\nexport const x = user;\n",
        'test/user.test.ts':
          "import { user } from '../src/userService.js';\nexport const t = user;\n",
      },
      { recipe, rule: RULE, changed: ['src/userService.ts'] },
    );
    expect(result.tree['src/userService.ts']).toBeUndefined();
    expect(result.tree['src/user-service.ts']).toBe(
      "import { base } from './base.js';\nexport const user = base;\n",
    );
    expect(result.tree['src/use.ts']).toMatchInlineSnapshot(`
      "import { user } from './user-service.js';
      export const x = user;
      "
    `);
    expect(result.tree['test/user.test.ts']).toMatchInlineSnapshot(`
      "import { user } from '../src/user-service.js';
      export const t = user;
      "
    `);
    expect(remaining(result, 'src/user-service.ts')).toEqual([]);
  });

  it('moves a file that nothing imports with a plain move', () => {
    const result = projects.fix(
      { 'src/someHelper.ts': 'export const a = 1;\n' },
      { recipe, rule: RULE },
    );
    expect(result.tree).toHaveProperty(['src/some-helper.ts'], 'export const a = 1;\n');
  });

  it.each([
    {
      name: 'the new name is taken',
      extra: { 'src/user-service.ts': 'export const b = 1;\n' },
      note: 'src/user-service.ts is taken',
    },
    {
      name: 'another module loads the file with a computed path',
      extra: {
        'src/lazy.ts': 'export const load = (name: string) => import("./" + name + ".js");\n',
      },
      note: 'src/lazy.ts loads a module with a computed path',
    },
    {
      name: 'a string names the module',
      extra: { 'test/mock.test.ts': "vi.mock('../src/userService.js');\n" },
      note: 'test/mock.test.ts names the module in a string',
    },
  ])('declines when $name', ({ extra, note }) => {
    const files = { 'src/userService.ts': 'export const a = 1;\n', ...extra };
    const result = projects.fix(files, { recipe, rule: RULE, changed: ['src/userService.ts'] });
    expect(result.tree['src/userService.ts']).toBe(files['src/userService.ts']);
    expect(result.notes).toEqual([`--fix left src/userService.ts:1 file-name-casing: ${note}`]);
  });
});
