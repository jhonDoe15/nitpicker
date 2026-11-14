import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { unusedOptionRecipe, unusedPropRecipe } from './unused-members.mjs';

const projects = useFixtureProjects();

describe('unused member recipes', () => {
  it('are review recipes of project scope for the structure rules', () => {
    expect(
      [unusedOptionRecipe, unusedPropRecipe].map(({ rules, safety }) => [rules, safety]),
    ).toEqual([
      [[{ tool: 'structure', rule: 'unused-option' }], 'review'],
      [[{ tool: 'structure', rule: 'unused-prop' }], 'review'],
    ]);
  });

  describe('unusedOptionRecipe', () => {
    const rule = 'structure/unused-option';

    it('drops the option no caller sets from the type and the destructuring', () => {
      const result = projects.fix(
        {
          'src/run.ts':
            'export type RunOptions = {\n  retries?: number;\n  verbose?: boolean;\n};\nexport function run(task: string, { retries }: RunOptions = {}) {\n  return [task, retries];\n}\n',
          'src/use.ts': "import { run } from './run.js';\nrun('a', { retries: 2 });\nrun('b');\n",
        },
        { recipe: unusedOptionRecipe, rule, changed: ['src/run.ts'] },
      );
      expect(result.tree['src/run.ts']).toBe(
        'export type RunOptions = {\n  retries?: number;\n};\nexport function run(task: string, { retries }: RunOptions = {}) {\n  return [task, retries];\n}\n',
      );
    });

    it('removes the destructured binding too', () => {
      const result = projects.fix(
        {
          'src/run.ts':
            'export function run(task: string, { retries, verbose }: { retries?: number; verbose?: boolean }) {\n  return [task, retries];\n}\n',
          'src/use.ts': "import { run } from './run.js';\nrun('a', { retries: 2 });\n",
        },
        { recipe: unusedOptionRecipe, rule, changed: ['src/run.ts'] },
      );
      expect(result.tree['src/run.ts']).toMatchInlineSnapshot(`
        "export function run(task: string, { retries }: { retries?: number; }) {
          return [task, retries];
        }
        "
      `);
    });

    it('declines when the function body reads the option', () => {
      const files = {
        'src/run.ts':
          'export function run(task: string, options: { retries?: number; verbose?: boolean }) {\n  return [task, options.retries, options.verbose];\n}\n',
        'src/use.ts': "import { run } from './run.js';\nrun('a', { retries: 2 });\n",
      };
      const result = projects.fix(files, {
        recipe: unusedOptionRecipe,
        rule,
        changed: ['src/run.ts'],
      });
      expect(result.tree['src/run.ts']).toBe(files['src/run.ts']);
      expect(result.notes).toMatchInlineSnapshot(`
        [
          "--fix left src/run.ts:1 unused-option: the change would add errors to src/run.ts",
        ]
      `);
    });
  });

  describe('unusedPropRecipe', () => {
    const rule = 'structure/unused-prop';
    const MANIFEST = JSON.stringify({ dependencies: { react: '19.0.0' } });

    it('drops the prop no element sets from the type and the destructuring', () => {
      const result = projects.fix(
        {
          'package.json': MANIFEST,
          'src/badge.tsx':
            'export type BadgeProps = { label: string; tone?: string };\nexport function Badge({ label, tone }: BadgeProps) {\n  return label;\n}\n',
          'src/use.tsx':
            'import { Badge } from \'./badge.js\';\nexport const x = <Badge label="a" />;\n',
        },
        { recipe: unusedPropRecipe, rule, changed: ['src/badge.tsx'], inputs: {} },
      );
      expect(result.tree['src/badge.tsx']).toBe(
        'export type BadgeProps = { label: string; };\nexport function Badge({ label }: BadgeProps) {\n  return label;\n}\n',
      );
    });
  });
});
