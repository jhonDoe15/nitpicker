import { describe, expect, it } from 'vitest';
import { fileNameCasingRecipe as recipe } from '../moves/file-name-casing.mjs';
import { useFixtureProjects } from '../test-support/fixture-project.mjs';
import { resolveLayoutFor } from '../../../preset/layout.mjs';

const projects = useFixtureProjects();
const RULE = 'eslint/nitpicker/file-name-casing';

function rename(files, options = {}) {
  return projects.fix(
    { 'src/myHelper.ts': 'export const h = 1;\n', ...files },
    { recipe, rule: RULE, changed: ['src/myHelper.ts'], ...options },
  );
}

describe('moves that outside importers would break', () => {
  it('decline when package.json names the file as an entry point', () => {
    const result = rename({ 'package.json': '{"type":"module","main":"./src/myHelper.js"}' });
    expect(result.tree['src/myHelper.ts']).toBe('export const h = 1;\n');
    expect(result.notes).toEqual([
      '--fix left src/myHelper.ts:1 file-name-casing: package.json names the module as an entry point',
    ]);
  });

  it('decline when a template file may import the file', () => {
    const result = rename({
      'src/App.vue': "<script setup>\nimport { h } from './myHelper';\n</script>\n",
    });
    expect(result.tree['src/myHelper.ts']).toBe('export const h = 1;\n');
    expect(result.notes).toEqual([
      '--fix left src/myHelper.ts:1 file-name-casing: src/App.vue may import the module',
    ]);
  });

  it('follow a jsconfig.json path alias in a JavaScript project', () => {
    const result = projects.fix(
      {
        'src/myHelper.js': 'export const h = 1;\n',
        'src/use.js': "import { h } from '@app/myHelper.js';\nexport const u = h;\n",
        'jsconfig.json': JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@app/*': ['src/*'] },
            types: [],
            lib: ['ES2022'],
          },
        }),
        'tsconfig.json': undefined,
      },
      {
        recipe,
        rule: RULE,
        changed: ['src/myHelper.js'],
        inputs: { layout: resolveLayoutFor({ preset: 'javascript' }) },
      },
    );
    expect(result.tree['src/use.js']).toBe(
      "import { h } from '@app/my-helper.js';\nexport const u = h;\n",
    );
  });
});
