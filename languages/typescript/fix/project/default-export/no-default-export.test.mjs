import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { withProject } from '../model/project-model.mjs';
import { lintRule } from '../model/lint-rule.mjs';
import { defaultExportSelectors } from '../../../preset/eslint-config/strict/strict-declarations.mjs';
import { noDefaultExportRecipe as recipe } from './no-default-export.mjs';

const projects = useFixtureProjects();
const RULE = 'eslint/nitpicker/no-default-export';

function fix(files, changed) {
  return projects.fix(files, { recipe, rule: RULE, changed });
}

function remaining(result, name) {
  const read = (file) => result.tree[file];
  const context = { projectRoot: result.projectRoot, files: [{ path: name }], read };
  return withProject(context, (project) =>
    lintRule(project, name, { ruleId: 'no-default-export', options: defaultExportSelectors }),
  );
}

describe('noDefaultExportRecipe', () => {
  it('is a review recipe of project scope for both presets', () => {
    expect([recipe.presets, recipe.safety, recipe.scope, recipe.rules]).toEqual([
      ['typescript', 'javascript'],
      'review',
      'project',
      [{ tool: 'eslint', rule: 'nitpicker/no-default-export' }],
    ]);
  });

  it('names a default function and rewrites default, renamed and re-exporting importers', () => {
    const result = fix(
      {
        'src/greet.ts': 'export default function greet(name: string) {\n  return name;\n}\n',
        'src/a.ts': "import greet from './greet.js';\nexport const a = greet('a');\n",
        'src/b.ts':
          "import hello, { type X } from './other.js';\nimport say from './greet.js';\nexport const b = say('b') + hello;\nexport type { X };\n",
        'src/other.ts': "export type X = 1;\nexport default 'hi';\n",
        'src/c.ts':
          "export { default as welcome } from './greet.js';\nimport * as ns from './greet.js';\nexport const c = ns.default('c');\n",
      },
      ['src/greet.ts'],
    );
    expect(result.tree['src/greet.ts']).toBe(
      'export function greet(name: string) {\n  return name;\n}\n',
    );
    expect(result.tree['src/a.ts']).toMatchInlineSnapshot(`
      "import { greet } from './greet.js';
      export const a = greet('a');
      "
    `);
    expect(result.tree['src/b.ts']).toMatchInlineSnapshot(`
      "import hello, { type X } from './other.js';
      import { greet as say } from './greet.js';
      export const b = say('b') + hello;
      export type { X };
      "
    `);
    expect(result.tree['src/c.ts']).toMatchInlineSnapshot(`
      "export { greet as welcome } from './greet.js';
      import * as ns from './greet.js';
      export const c = ns.greet('c');
      "
    `);
    expect(remaining(result, 'src/greet.ts')).toEqual([]);
    expect(result.fixedFindings).toEqual([
      'src/greet.ts:1 eslint/nitpicker/no-default-export (typescript-no-default-export)',
    ]);
  });

  it('names an anonymous default after its file and an expression default too', () => {
    const result = fix(
      {
        'src/make-user.ts': 'export default function () {\n  return 1;\n}\n',
        'src/settings.ts': 'export default { retries: 3 };\n',
        'src/use.ts':
          "import makeUser from './make-user.js';\nimport settings from './settings.js';\nexport const x = [makeUser(), settings];\n",
      },
      ['src/make-user.ts', 'src/settings.ts'],
    );
    expect(result.tree['src/make-user.ts']).toBe('export function makeUser() {\n  return 1;\n}\n');
    expect(result.tree['src/settings.ts']).toBe('export const settings = { retries: 3 };\n');
    expect(result.tree['src/use.ts']).toMatchInlineSnapshot(`
      "import { makeUser } from './make-user.js';
      import { settings } from './settings.js';
      export const x = [makeUser(), settings];
      "
    `);
  });

  it('declines when the module is also loaded with a dynamic import', () => {
    const files = {
      'src/greet.ts': 'export default function greet() {}\n',
      'src/lazy.ts': "export const load = () => import('./greet.js');\n",
    };
    const result = fix(files, ['src/greet.ts']);
    expect(result.tree['src/greet.ts']).toBe(files['src/greet.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/greet.ts:1 no-default-export: src/lazy.ts loads the module in a way that names its exports at run time",
      ]
    `);
  });

  it('declines when a namespace import is read by a computed key', () => {
    const files = {
      'src/greet.ts': 'export default function greet() {}\n',
      'src/use.ts': "import * as ns from './greet.js';\nexport const f = ns['default'];\n",
    };
    const result = fix(files, ['src/greet.ts']);
    expect(result.tree['src/greet.ts']).toBe(files['src/greet.ts']);
  });

  it('declines when a test mocks the module by its path string', () => {
    const files = {
      'src/greet.ts': 'export default function greet() {\n  return 1;\n}\n',
      'src/greet.test.ts':
        "import { vi } from 'vitest';\nvi.mock('./greet.js', () => ({ default: () => 2 }));\n",
    };
    const result = fix(files, ['src/greet.ts']);
    expect(result.tree['src/greet.ts']).toBe(files['src/greet.ts']);
    expect(result.notes).toEqual([
      '--fix left src/greet.ts:1 no-default-export: src/greet.test.ts names the module in a string',
    ]);
  });

  it('declines when another module re-exports it as a namespace', () => {
    const files = {
      'src/greet.ts': 'export default function greet() {\n  return 1;\n}\n',
      'src/all.ts': "export * as greeting from './greet.js';\n",
      'src/use.ts': "import { greeting } from './all.js';\nexport const x = greeting.default();\n",
    };
    const result = fix(files, ['src/greet.ts']);
    expect(result.tree['src/greet.ts']).toBe(files['src/greet.ts']);
    expect(result.notes).toEqual([
      '--fix left src/greet.ts:1 no-default-export: src/all.ts re-exports the module as a namespace',
    ]);
  });

  it('leaves config files alone', () => {
    const files = { 'vite.config.ts': 'export default {};\n' };
    expect(fix(files).tree['vite.config.ts']).toBe(files['vite.config.ts']);
  });
});
