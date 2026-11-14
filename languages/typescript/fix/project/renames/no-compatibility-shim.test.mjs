import { describe, expect, it } from 'vitest';
import { lintRule } from '../model/lint-rule.mjs';
import { withProject } from '../model/project-model.mjs';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { noCompatibilityShimRecipe as recipe } from './no-compatibility-shim.mjs';

const projects = useFixtureProjects();
const RULE = 'eslint/nitpicker/no-compatibility-shim';

function remaining(result, name) {
  const context = {
    projectRoot: result.projectRoot,
    files: [{ path: name }],
    read: (n) => result.tree[n],
  };
  return withProject(context, (project) =>
    lintRule(project, name, { ruleId: 'no-compatibility-shim' }),
  );
}

describe('noCompatibilityShimRecipe', () => {
  it('is a review recipe of project scope', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'eslint', rule: 'nitpicker/no-compatibility-shim' }],
    ]);
  });

  it('drops a second exported name and points its importers at the canonical one', () => {
    const result = projects.fix(
      {
        'src/client.ts':
          'export function createClient() {\n  return 1;\n}\nexport const makeClient = createClient;\nexport { createClient as buildClient };\n',
        'src/use.ts': "import { makeClient } from './client.js';\nexport const a = makeClient();\n",
        'src/other.ts':
          "import { buildClient } from './client.js';\nexport const b = buildClient();\n",
      },
      { recipe, rule: RULE, changed: ['src/client.ts'] },
    );
    expect(result.tree['src/client.ts']).toBe('export function createClient() {\n  return 1;\n}\n');
    expect(result.tree['src/use.ts']).toBe(
      "import { createClient } from './client.js';\nexport const a = createClient();\n",
    );
    expect(result.tree['src/other.ts']).toBe(
      "import { createClient } from './client.js';\nexport const b = createClient();\n",
    );
    expect(remaining(result, 'src/client.ts')).toEqual([]);
  });

  it('declines when an importer already imports the canonical name too', () => {
    const files = {
      'src/client.ts':
        'export function createClient() {}\nexport const makeClient = createClient;\n',
      'src/use.ts':
        "import { makeClient, createClient } from './client.js';\nexport const a = [makeClient, createClient];\n",
    };
    const result = projects.fix(files, { recipe, rule: RULE, changed: ['src/client.ts'] });
    expect(result.tree['src/client.ts']).toBe(files['src/client.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/client.ts:2 no-compatibility-shim: the change would add errors to src/use.ts",
      ]
    `);
  });
});
