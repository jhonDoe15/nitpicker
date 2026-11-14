import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import {
  noExternalExecutablesInUnitTestsRecipe,
  noTestHelpersInSourceRecipe,
  noUncollectedTestsRecipe,
} from './test-placement.mjs';

const projects = useFixtureProjects();
const TESTS = "import { it } from 'vitest';\nit('works', () => {});\n";

describe('test placement recipes', () => {
  it('are review recipes of project scope', () => {
    const recipes = [
      noTestHelpersInSourceRecipe,
      noUncollectedTestsRecipe,
      noExternalExecutablesInUnitTestsRecipe,
    ];
    expect(recipes.map(({ safety, scope, presets }) => [safety, scope, presets])).toEqual(
      recipes.map(() => ['review', 'project', ['typescript', 'javascript']]),
    );
  });

  describe('noTestHelpersInSourceRecipe', () => {
    const rule = 'eslint/nitpicker/no-test-helpers-in-source';

    it('moves a helper to the test-support folder under the test root', () => {
      const result = projects.fix(
        {
          'src/lib/test-utils.ts': 'export const helper = 1;\n',
          'test/unit/a.test.ts':
            "import { helper } from '../../src/lib/test-utils.js';\nexport const a = helper;\n",
        },
        { recipe: noTestHelpersInSourceRecipe, rule, changed: ['src/lib/test-utils.ts'] },
      );
      expect(result.tree['src/lib/test-utils.ts']).toBeUndefined();
      expect(result.tree['test/test-support/lib/test-utils.ts']).toBe('export const helper = 1;\n');
      expect(result.tree['test/unit/a.test.ts']).toMatchInlineSnapshot(`
        "import { helper } from '../test-support/lib/test-utils.js';
        export const a = helper;
        "
      `);
    });

    it('declines when production code imports the helper', () => {
      const files = {
        'src/lib/test-utils.ts': 'export const helper = 1;\n',
        'src/lib/real.ts':
          "import { helper } from './test-utils.js';\nexport const real = helper;\n",
      };
      const result = projects.fix(files, {
        recipe: noTestHelpersInSourceRecipe,
        rule,
        changed: ['src/lib/test-utils.ts'],
      });
      expect(result.tree['src/lib/test-utils.ts']).toBe(files['src/lib/test-utils.ts']);
      expect(result.notes).toMatchInlineSnapshot(`
        [
          "--fix left src/lib/test-utils.ts:1 no-test-helpers-in-source: src/lib/real.ts is production code that imports it",
        ]
      `);
    });
  });

  describe('noUncollectedTestsRecipe', () => {
    const rule = 'eslint/nitpicker/no-uncollected-tests';

    it('renames a file that defines tests to a test file name', () => {
      const result = projects.fix(
        { 'test/unit/checks.ts': TESTS },
        { recipe: noUncollectedTestsRecipe, rule },
      );
      expect(result.tree['test/unit/checks.ts']).toBeUndefined();
      expect(result.tree['test/unit/checks.test.ts']).toBe(TESTS);
    });

    it('declines when the test file name is taken', () => {
      const files = { 'test/unit/checks.ts': TESTS, 'test/unit/checks.test.ts': TESTS };
      const result = projects.fix(files, {
        recipe: noUncollectedTestsRecipe,
        rule,
        changed: ['test/unit/checks.ts'],
      });
      expect(result.tree['test/unit/checks.ts']).toBe(TESTS);
    });
  });

  describe('noExternalExecutablesInUnitTestsRecipe', () => {
    const rule = 'eslint/nitpicker/no-external-executables-in-unit-tests';
    const SPAWN =
      "import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['--version']);\n";

    it('moves a unit test that runs executables into the integration folder', () => {
      const result = projects.fix(
        { 'test/unit/git.test.ts': SPAWN },
        { recipe: noExternalExecutablesInUnitTestsRecipe, rule },
      );
      expect(result.tree['test/unit/git.test.ts']).toBeUndefined();
      expect(result.tree['test/integration/git.test.ts']).toBe(SPAWN);
    });

    it('declines when a string names the test file', () => {
      const files = {
        'test/unit/git.test.ts': SPAWN,
        'test/setup.ts': "export const path = './unit/git.test.js';\n",
      };
      const result = projects.fix(files, {
        recipe: noExternalExecutablesInUnitTestsRecipe,
        rule,
        changed: ['test/unit/git.test.ts'],
      });
      expect(result.tree['test/unit/git.test.ts']).toBe(SPAWN);
      expect(result.notes).toMatchInlineSnapshot(`
        [
          "--fix left test/unit/git.test.ts:1 no-external-executables-in-unit-tests: test/setup.ts names the module in a string",
        ]
      `);
    });
  });
});
