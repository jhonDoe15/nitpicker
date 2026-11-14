import { describe, expect, it } from 'vitest';
import { analyzeEntryPoints } from '../../../preset/entry-points/analyze.mjs';
import { projectGraph } from '../model/project-graph.mjs';
import { withProject } from '../model/project-model.mjs';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import {
  featureInternalsOnlyThroughIndexRecipe,
  publicAlternativeBypassRecipe,
} from './entry-point-imports.mjs';

const projects = useFixtureProjects();
const BYPASS = 'entry-points/public-alternative-bypass';
const INTERNALS = 'dependency-architecture/feature-internals-only-through-index';

function bypassesAfter(result) {
  const names = Object.keys(result.tree).filter((name) => name.startsWith('src/'));
  const context = {
    projectRoot: result.projectRoot,
    files: names.map((path) => ({ path })),
    read: (name) => result.tree[name],
  };
  return withProject(context, (project) =>
    analyzeEntryPoints(projectGraph(project), 'src').publicAlternativeBypasses.map(
      ({ source }) => source,
    ),
  );
}

describe('publicAlternativeBypassRecipe', () => {
  const files = {
    'src/billing/index.ts': "export { price } from './money.js';\n",
    'src/billing/money.ts':
      'export const price = 1;\nexport const tax = 2;\nexport type Cents = number;\n',
    'src/orders/order.ts':
      "import { price, tax, type Cents } from '../billing/money.js';\nexport const total: Cents = price + tax;\n",
  };

  it('is a review recipe of project scope for the entry-points rule', () => {
    expect([
      publicAlternativeBypassRecipe.safety,
      publicAlternativeBypassRecipe.scope,
      publicAlternativeBypassRecipe.rules,
    ]).toEqual([
      'review',
      'project',
      [{ tool: 'entry-points', rule: 'public-alternative-bypass' }],
    ]);
  });

  it('declines when the entry point already reaches the importer', () => {
    const cyclic = {
      'src/billing/index.ts':
        "export { price } from './money.js';\nexport { y } from '../orders/order.js';\n",
      'src/billing/money.ts': 'export const price = 1;\n',
      'src/orders/order.ts':
        "import { price } from '../billing/money.js';\nexport const y = price;\n",
    };
    const result = projects.fix(cyclic, {
      recipe: publicAlternativeBypassRecipe,
      rule: BYPASS,
      changed: ['src/orders/order.ts'],
    });
    expect(result.tree['src/orders/order.ts']).toBe(cyclic['src/orders/order.ts']);
    expect(result.notes).toEqual([
      '--fix left src/orders/order.ts:1 public-alternative-bypass: pointing src/orders/order.ts at src/billing/index.ts would add an import cycle',
    ]);
  });

  it('imports from the entry point and adds the exports the entry point lacks', () => {
    const result = projects.fix(files, {
      recipe: publicAlternativeBypassRecipe,
      rule: BYPASS,
      changed: ['src/orders/order.ts'],
    });
    expect(result.tree['src/orders/order.ts']).toMatchInlineSnapshot(`
      "import { price, tax, type Cents } from '../billing/index.js';
      export const total: Cents = price + tax;
      "
    `);
    expect(result.tree['src/billing/index.ts']).toBe(
      "export { price } from './money.js';\nexport { tax } from './money.js';\nexport type { Cents } from './money.js';\n",
    );
    expect(bypassesAfter(result)).toEqual([]);
  });

  it('declines a default import, which the entry point would have to re-export under a name', () => {
    const declined = {
      ...files,
      'src/billing/money.ts': 'export const price = 1;\nexport default 3;\n',
      'src/orders/order.ts':
        "import fallback from '../billing/money.js';\nexport const total = fallback;\n",
    };
    const result = projects.fix(declined, {
      recipe: publicAlternativeBypassRecipe,
      rule: BYPASS,
      changed: ['src/orders/order.ts'],
    });
    expect(result.tree['src/orders/order.ts']).toBe(declined['src/orders/order.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/orders/order.ts:1 public-alternative-bypass: it imports a default, a namespace or everything, which --fix does not retarget",
      ]
    `);
  });
});

describe('featureInternalsOnlyThroughIndexRecipe', () => {
  const FEATURE = 'src/main/features/billing';
  const files = {
    [`${FEATURE}/index.ts`]: "export { price } from './price.js';\n",
    [`${FEATURE}/price.ts`]: 'export const price = 1;\nexport const tax = 2;\n',
    'src/main/app.ts':
      "import { price, tax } from './features/billing/price.js';\nexport const x = price + tax;\n",
  };

  it('imports the feature through its index and exports the missing name there', () => {
    const result = projects.fix(files, {
      recipe: featureInternalsOnlyThroughIndexRecipe,
      rule: INTERNALS,
      changed: ['src/main/app.ts'],
    });
    expect(result.tree['src/main/app.ts']).toMatchInlineSnapshot(`
      "import { price, tax } from './features/billing/index.js';
      export const x = price + tax;
      "
    `);
    expect(result.tree[`${FEATURE}/index.ts`]).toBe(
      "export { price } from './price.js';\nexport { tax } from './price.js';\n",
    );
  });

  it('plans the second importer of the same missing export on the next pass, once', () => {
    const result = projects.fix(
      {
        ...files,
        'src/main/other.ts':
          "import { tax } from './features/billing/price.js';\nexport const y = tax;\n",
      },
      {
        recipe: featureInternalsOnlyThroughIndexRecipe,
        rule: INTERNALS,
        changed: ['src/main/app.ts', 'src/main/other.ts'],
      },
    );
    expect(result.tree[`${FEATURE}/index.ts`].match(/tax/gu)).toHaveLength(1);
    expect(result.tree['src/main/other.ts']).toMatchInlineSnapshot(`
      "import { tax } from './features/billing/index.js';
      export const y = tax;
      "
    `);
  });

  it('declines a namespace import and leaves files inside the feature alone', () => {
    const declined = {
      ...files,
      'src/main/app.ts':
        "import * as price from './features/billing/price.js';\nexport const x = price.tax;\n",
      [`${FEATURE}/other.ts`]: "import { tax } from './price.js';\nexport const y = tax;\n",
    };
    const result = projects.fix(declined, {
      recipe: featureInternalsOnlyThroughIndexRecipe,
      rule: INTERNALS,
    });
    expect(result.tree['src/main/app.ts']).toBe(declined['src/main/app.ts']);
    expect(result.tree[`${FEATURE}/other.ts`]).toBe(declined[`${FEATURE}/other.ts`]);
  });
});
