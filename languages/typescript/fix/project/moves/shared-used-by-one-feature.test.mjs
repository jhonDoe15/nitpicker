import { describe, expect, it } from 'vitest';
import { sharedUsedByOneFeature } from '../../../preset/coupling/shared-usage.mjs';
import { projectGraph } from '../model/project-graph.mjs';
import { withProject } from '../model/project-model.mjs';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { sharedUsedByOneFeatureRecipe as recipe } from './shared-used-by-one-feature.mjs';

const projects = useFixtureProjects();
const RULE = 'coupling/shared-used-by-one-feature';
const BILLING = 'src/main/features/billing';
const SHARED = 'src/main/shared';

function remaining(result) {
  const names = Object.keys(result.tree).filter((name) => name.startsWith('src/'));
  const context = {
    projectRoot: result.projectRoot,
    files: names.map((path) => ({ path })),
    read: (name) => result.tree[name],
  };
  return withProject(context, (project) =>
    sharedUsedByOneFeature(projectGraph(project), {
      sourceRoot: 'src',
      isProduction: (file) => file.startsWith('src/'),
    }),
  );
}

describe('sharedUsedByOneFeatureRecipe', () => {
  it('is a review recipe of project scope for the coupling rule', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'coupling', rule: 'shared-used-by-one-feature' }],
    ]);
  });

  it('moves the module into the one feature that uses it and rewrites the imports', () => {
    const result = projects.fix(
      {
        [`${SHARED}/format-price.ts`]: 'export const formatPrice = (n: number) => n;\n',
        [`${BILLING}/index.ts`]:
          "import { formatPrice } from '../../shared/format-price.js';\nexport const total = formatPrice(1);\n",
        [`${BILLING}/domain/totals.ts`]:
          "import { formatPrice } from '../../../shared/format-price.js';\nexport const t = formatPrice(2);\n",
      },
      { recipe, rule: RULE, changed: [`${SHARED}/format-price.ts`] },
    );
    expect(result.tree[`${SHARED}/format-price.ts`]).toBeUndefined();
    expect(result.tree[`${BILLING}/format-price.ts`]).toContain('formatPrice');
    expect(result.tree[`${BILLING}/index.ts`]).toContain("from './format-price.js'");
    expect(result.tree[`${BILLING}/domain/totals.ts`]).toContain("from '../format-price.js'");
    expect(remaining(result)).toEqual([]);
  });

  it('declines when the feature already has a file of that name', () => {
    const files = {
      [`${SHARED}/format-price.ts`]: 'export const a = 1;\n',
      [`${BILLING}/format-price.ts`]: 'export const b = 1;\n',
      [`${BILLING}/index.ts`]:
        "import { a } from '../../shared/format-price.js';\nexport const c = a;\n",
    };
    const result = projects.fix(files, {
      recipe,
      rule: RULE,
      changed: [`${SHARED}/format-price.ts`],
    });
    expect(result.tree[`${SHARED}/format-price.ts`]).toBe(files[`${SHARED}/format-price.ts`]);
    expect(result.notes.join('\n')).toContain('shared-used-by-one-feature');
  });

  it('declines when another shared module imports it', () => {
    const files = {
      [`${SHARED}/leaf.ts`]: 'export const leaf = 1;\n',
      [`${SHARED}/helper.ts`]: "import { leaf } from './leaf.js';\nexport const helper = leaf;\n",
      [`${BILLING}/index.ts`]:
        "import { helper } from '../../shared/helper.js';\nexport const c = helper;\n",
    };
    const result = projects.fix(files, { recipe, rule: RULE, changed: [`${SHARED}/leaf.ts`] });
    expect(result.tree[`${SHARED}/leaf.ts`]).toBe(files[`${SHARED}/leaf.ts`]);
    expect(result.notes.join('\n')).toContain('imports it');
  });
});
