import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { exportedNameCollisionRecipe as recipe } from './name-collision.mjs';
import { reuseFindingsFor } from './reuse-findings.mjs';

const projects = useFixtureProjects();
const RULE = 'structure/exported-name-collision';
const SHARED = 'export function getFilters(a: number, b: number) {\n  return a + b;\n}\n';
const ORDERS = 'export function getFilters(a: number) {\n  return a;\n}\n';

describe('exportedNameCollisionRecipe', () => {
  it('is a safe recipe of project scope for the structure rule', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'safe',
      'project',
      [{ tool: 'structure', rule: 'exported-name-collision' }],
    ]);
  });

  it('aliases the import that keeps the name, and its uses', () => {
    const result = projects.fix(
      {
        'src/shared/filters.ts': SHARED,
        'src/orders/filters.ts': ORDERS,
        'src/orders/table.ts':
          "import { getFilters } from '../shared/filters.js';\nimport { getFilters as orderFilters } from './filters.js';\nexport const rows = [getFilters(1, 2), orderFilters(2)];\n",
      },
      { recipe, rule: RULE },
    );
    expect(result.tree['src/orders/table.ts']).toBe(
      "import { getFilters as sharedGetFilters } from '../shared/filters.js';\nimport { getFilters as orderFilters } from './filters.js';\nexport const rows = [sharedGetFilters(1, 2), orderFilters(2)];\n",
    );
    expect(
      reuseFindingsFor({ projectRoot: result.projectRoot }, 'exported-name-collision'),
    ).toEqual([]);
  });

  it('declines when the alias is already declared in the importer', () => {
    const files = {
      'src/shared/filters.ts': SHARED,
      'src/orders/filters.ts': ORDERS,
      'src/orders/table.ts':
        "import { getFilters } from '../shared/filters.js';\nimport { getFilters as orderFilters } from './filters.js';\nconst sharedGetFilters = 1;\nexport const rows = [getFilters(1, 2), orderFilters(2), sharedGetFilters];\n",
    };
    const result = projects.fix(files, { recipe, rule: RULE });
    expect(result.tree['src/orders/table.ts']).toBe(files['src/orders/table.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/shared/filters.ts:1 exported-name-collision: the change would add errors to src/orders/table.ts",
      ]
    `);
  });
});
