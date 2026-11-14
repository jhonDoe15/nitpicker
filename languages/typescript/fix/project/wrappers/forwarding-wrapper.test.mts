import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mts';
import { remainingFindings } from '../test-support/remaining-findings.mts';
import { noForwardingWrapperRecipe as recipe } from './forwarding-wrapper.mts';

const projects = useFixtureProjects();
const RULE = 'eslint/nitpicker/no-forwarding-wrapper';
const TARGET = 'export function target(a: number) {\n  return a + 1;\n}\n';

const LINT = { ruleId: 'no-forwarding-wrapper', typed: true } as const;

describe('noForwardingWrapperRecipe', () => {
  it('is a review recipe of project scope', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'eslint', rule: 'nitpicker/no-forwarding-wrapper' }],
    ]);
  });

  it('points the importers at the target and deletes the exported wrapper', () => {
    const result = projects.fix(
      {
        'src/target.ts': TARGET,
        'src/wrapper.ts':
          "import { target } from './target.js';\nexport function wrapper(a: number) {\n  return target(a);\n}\n",
        'src/use.ts':
          "import { wrapper } from './wrapper.js';\nimport { other } from './other.js';\nexport const x = wrapper(1) + other;\n",
        'src/other.ts': 'export const other = 1;\n',
      },
      { recipe, rule: RULE, changed: ['src/wrapper.ts'] },
    );
    expect(result.tree['src/use.ts']).toBe(
      "import { target } from './target.js';\nimport { other } from './other.js';\nexport const x = target(1) + other;\n",
    );
    const paths = Object.keys(result.tree).filter((file) => file.startsWith('src/'));
    expect(remainingFindings(result, 'src/wrapper.ts', LINT, paths)).toEqual([]);
  });

  it('calls the target directly where a private wrapper was used', () => {
    const result = projects.fix(
      {
        'src/target.ts': TARGET,
        'src/local.ts':
          "import { target } from './target.js';\nconst wrapper = (a: number) => target(a);\nexport const x = wrapper(1);\n",
      },
      { recipe, rule: RULE },
    );
    expect(result.tree['src/local.ts']).toBe(
      "import { target } from './target.js';\nexport const x = target(1);\n",
    );
  });

  it('declines when a barrel re-exports the wrapper', () => {
    const files = {
      'src/target.ts': TARGET,
      'src/wrapper.ts':
        "import { target } from './target.js';\nexport function wrapper(a: number) {\n  return target(a);\n}\n",
      'src/index.ts': "export { wrapper } from './wrapper.js';\n",
    };
    const result = projects.fix(files, { recipe, rule: RULE, changed: ['src/wrapper.ts'] });
    expect(result.tree['src/wrapper.ts']).toBe(files['src/wrapper.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/wrapper.ts:2 no-forwarding-wrapper: src/index.ts refers to the wrapper in a form --fix does not retarget",
      ]
    `);
  });
});
