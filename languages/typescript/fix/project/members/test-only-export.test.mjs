import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { testOnlyExportRecipe as recipe } from './test-only-export.mjs';

const projects = useFixtureProjects();
const RULE = 'dead-code/test-only-export';

describe('testOnlyExportRecipe', () => {
  it('is a review recipe of project scope for the dead-code rule', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'dead-code', rule: 'test-only-export' }],
    ]);
  });

  it('moves an export only tests import into test support and repoints the tests', () => {
    const result = projects.fix(
      {
        'src/prices.ts':
          "import type { Money } from './money.js';\nexport const price = (m: Money) => m;\nexport function makeFixture(): Money {\n  return 1;\n}\n",
        'src/money.ts': 'export type Money = number;\n',
        'src/app.ts': "import { price } from './prices.js';\nexport const x = price(1);\n",
        'test/prices.test.ts':
          "import { makeFixture, price } from '../src/prices.js';\nexport const t = [makeFixture(), price(1)];\n",
      },
      { recipe, rule: RULE, changed: ['src/prices.ts'] },
    );
    expect(result.tree['src/prices.ts']).toBe(
      "import type { Money } from './money.js';\nexport const price = (m: Money) => m;\n",
    );
    expect(result.tree['test/test-support/prices.ts']).toBe(
      "import type { Money } from '../../src/money.js';\nexport function makeFixture(): Money {\n  return 1;\n}\n",
    );
    expect(result.tree['test/prices.test.ts']).toBe(
      "import { price } from '../src/prices.js';\nimport { makeFixture } from './test-support/prices.js';\nexport const t = [makeFixture(), price(1)];\n",
    );
  });

  it('declines when the module uses the export itself', () => {
    const files = {
      'src/prices.ts':
        'export function helper() {\n  return 1;\n}\nexport const price = helper() + 1;\n',
      'test/prices.test.ts':
        "import { helper } from '../src/prices.js';\nexport const t = helper();\n",
    };
    const result = projects.fix(files, { recipe, rule: RULE, changed: ['src/prices.ts'] });
    expect(result.tree['src/prices.ts']).toBe(files['src/prices.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/prices.ts:1 test-only-export: helper is also used inside src/prices.ts",
      ]
    `);
  });

  it('leaves an export that production code imports', () => {
    const files = {
      'src/prices.ts': 'export const price = 1;\n',
      'src/app.ts': "import { price } from './prices.js';\nexport const x = price;\n",
      'test/prices.test.ts': "import { price } from '../src/prices.js';\nexport const t = price;\n",
    };
    const result = projects.fix(files, { recipe, rule: RULE, changed: ['src/prices.ts'] });
    expect(result.tree['src/prices.ts']).toBe(files['src/prices.ts']);
  });
});
