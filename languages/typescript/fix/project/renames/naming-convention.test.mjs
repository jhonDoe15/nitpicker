import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { namingConventionRecipe as recipe } from './naming-convention.mjs';

const projects = useFixtureProjects();
const RULE = 'eslint/nitpicker/naming-convention';

describe('namingConventionRecipe', () => {
  it('is a review recipe of project scope', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'eslint', rule: 'nitpicker/naming-convention' }],
    ]);
  });

  it('renames a local variable and an exported function with its importers', () => {
    const result = projects.fix(
      {
        'src/user.ts':
          'export function get_user() {\n  const user_name = "a";\n  return user_name;\n}\nexport type user_record = { id: 1 };\n',
        'src/use.ts':
          "import { get_user, type user_record } from './user.js';\nexport const x: user_record = { id: 1 };\nexport const y = get_user();\n",
      },
      { recipe, rule: RULE, changed: ['src/user.ts'] },
    );
    expect(result.tree['src/user.ts']).toBe(
      'export function getUser() {\n  const userName = "a";\n  return userName;\n}\nexport type UserRecord = { id: 1 };\n',
    );
    expect(result.tree['src/use.ts']).toBe(
      "import { getUser, type UserRecord } from './user.js';\nexport const x: UserRecord = { id: 1 };\nexport const y = getUser();\n",
    );
    expect(result.fixedFindings).toHaveLength(3);
  });

  it('declines an exported rename when the module is loaded with a computed path', () => {
    const files = {
      'src/user.ts': 'export function get_user() {}\n',
      'src/lazy.ts': 'export const load = (name: string) => import("./" + name + ".js");\n',
    };
    const result = projects.fix(files, { recipe, rule: RULE, changed: ['src/user.ts'] });
    expect(result.tree['src/user.ts']).toBe(files['src/user.ts']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/user.ts:1 naming-convention: src/lazy.ts loads the module in a way that names its exports at run time",
      ]
    `);
  });

  it('declines a rename that would collide with another name', () => {
    const files = {
      'src/user.ts':
        'export const a = 1;\nexport function f() {\n  const my_var = 1;\n  const myVar = 2;\n  return my_var + myVar;\n}\n',
    };
    const result = projects.fix(files, { recipe, rule: RULE });
    expect(result.tree['src/user.ts']).toBe(files['src/user.ts']);
  });
});
