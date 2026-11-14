import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { noDevDependencyInProductionRecipe as recipe } from './dev-dependency.mjs';

const projects = useFixtureProjects();
const RULE = 'eslint/nitpicker/no-dev-dependency-in-production';
const SOURCE = "import pad from 'left-pad';\nexport const x = pad('a', 3);\n";

function manifest(sections, indent = 2) {
  return `${JSON.stringify({ name: 'app', version: '1.0.0', main: 'dist/index.js', ...sections }, null, indent)}\n`;
}

describe('noDevDependencyInProductionRecipe', () => {
  it('is a review recipe of project scope', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'eslint', rule: 'nitpicker/no-dev-dependency-in-production' }],
    ]);
  });

  it('moves the package into the existing dependencies, with its range, in order', () => {
    const result = projects.fix(
      {
        'package.json': manifest({
          dependencies: { zod: '^3.0.0' },
          devDependencies: { 'left-pad': '^1.3.0', vitest: '^3.0.0' },
        }),
        'src/a.ts': SOURCE,
      },
      { recipe, rule: RULE, changed: ['src/a.ts'] },
    );
    expect(result.tree['package.json']).toBe(
      manifest({
        dependencies: { 'left-pad': '^1.3.0', zod: '^3.0.0' },
        devDependencies: { vitest: '^3.0.0' },
      }),
    );
  });

  it('creates dependencies before devDependencies and keeps four-space indentation', () => {
    const result = projects.fix(
      {
        'package.json': manifest({ devDependencies: { 'left-pad': '^1.3.0' } }, 4),
        'src/a.ts': SOURCE,
      },
      { recipe, rule: RULE, changed: ['src/a.ts'] },
    );
    expect(result.tree['package.json']).toBe(
      manifest({ dependencies: { 'left-pad': '^1.3.0' }, devDependencies: {} }, 4),
    );
  });

  it('moves it once for two importing files', () => {
    const result = projects.fix(
      {
        'package.json': manifest({ devDependencies: { 'left-pad': '^1.3.0', vitest: '^3.0.0' } }),
        'src/a.ts': SOURCE,
        'src/b.ts': SOURCE,
      },
      { recipe, rule: RULE },
    );
    expect(result.tree['package.json'].match(/left-pad/gu)).toHaveLength(1);
  });

  it('leaves a bundled application alone', () => {
    const files = {
      'package.json': JSON.stringify(
        {
          name: 'app',
          scripts: { build: 'vite build' },
          devDependencies: { 'left-pad': '^1.3.0' },
        },
        null,
        2,
      ),
      'src/a.ts': SOURCE,
    };
    expect(projects.fix(files, { recipe, rule: RULE }).tree['package.json']).toBe(
      files['package.json'],
    );
  });

  it('declines when the manifest has a comment style --fix cannot move safely', () => {
    const files = {
      'package.json':
        '{\n  "name": "app",\n  "main": "x.js",\n  "devDependencies": { "left-pad": "^1.3.0" },\n  "dependencies": []\n}\n',
      'src/a.ts': SOURCE,
    };
    const result = projects.fix(files, { recipe, rule: RULE });
    expect(result.tree['package.json']).toBe(files['package.json']);
    expect(result.notes).toMatchInlineSnapshot(`
      [
        "--fix left src/a.ts:1 no-dev-dependency-in-production: package.json has no devDependencies entry for left-pad that --fix can move",
      ]
    `);
  });
});
