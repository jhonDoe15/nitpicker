import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { duplicateDefinitionRecipe as recipe } from './duplicate-definition.mjs';
import { reuseFindingsFor } from './reuse-findings.mjs';

const projects = useFixtureProjects();
const RULE = 'structure/duplicate-definition';
const USE = 'void [twice];\n';
const TWICE = 'function twice(a: number) {\n  return a * 2;\n}\n';

function remaining(result) {
  return reuseFindingsFor({ projectRoot: result.projectRoot }, 'duplicate-definition');
}

describe('duplicateDefinitionRecipe', () => {
  it('is a review recipe of project scope for the structure rule', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'structure', rule: 'duplicate-definition' }],
    ]);
  });

  it('keeps the exported copy and imports it in the other module', () => {
    const result = projects.fix(
      { 'src/a.ts': `export ${TWICE}${USE}`, 'src/b.ts': `${TWICE}${USE}` },
      { recipe, rule: RULE },
    );
    expect(result.tree['src/a.ts']).toBe(`export ${TWICE}${USE}`);
    expect(result.tree['src/b.ts']).toBe(`import { twice } from './a.js';\n${USE}`);
    expect(remaining(result)).toEqual([]);
  });

  it('exports the first of two private copies and imports it in the other', () => {
    const result = projects.fix(
      { 'src/a.ts': `${TWICE}${USE}`, 'src/b.ts': `${TWICE}${USE}` },
      { recipe, rule: RULE },
    );
    expect(result.tree['src/a.ts']).toBe(`export ${TWICE}${USE}`);
    expect(result.tree['src/b.ts']).toBe(`import { twice } from './a.js';\n${USE}`);
    expect(remaining(result)).toEqual([]);
  });

  it('re-exports the name from a removed copy that other modules import', () => {
    const result = projects.fix(
      {
        'src/a.ts': `export ${TWICE}${USE}`,
        'src/b.ts': `export ${TWICE}${USE}`,
        'src/c.ts': "import { twice } from './b.js';\nexport const four = twice(2);\n",
      },
      { recipe, rule: RULE, changed: ['src/b.ts'] },
    );
    expect(result.tree['src/b.ts']).toBe(
      `import { twice } from './a.js';\nexport { twice };\n${USE}`,
    );
  });

  it('declines when the kept module imports the other one, which would make a cycle', () => {
    const files = {
      'src/a.ts': `import { b } from './b.js';\nexport ${TWICE}${USE}export const a = b;\n`,
      'src/b.ts': `${TWICE}${USE}export const b = 1;\n`,
    };
    const result = projects.fix(files, { recipe, rule: RULE });
    expect(result.tree['src/b.ts']).toBe(files['src/b.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/b.ts:1 duplicate-definition: src/a.ts imports src/b.ts, so importing it would add a cycle",
      ]
    `);
  });
});
