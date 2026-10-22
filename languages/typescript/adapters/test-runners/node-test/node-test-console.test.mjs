import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_JS_SOURCE,
  PICK_SOURCE,
  createRunnerProjects,
  newConsoleOutput,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const LANGUAGES = [
  { extension: 'ts', source: PICK_SOURCE },
  { extension: 'js', source: PICK_JS_SOURCE },
];

function nodeTestProject({ extension, source }, warning) {
  const call = warning === undefined ? '' : `  console.warn('${warning}');\n`;
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test: 'node --test' } },
    [`src/main/pick.${extension}`]: source,
    [`test/pick.test.${extension}`]: `import { it } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { pick } from '../src/main/pick.${extension}';\nit('says yes', () => {\n${call}  assert.equal(pick(true), 'yes');\n});\n`,
  });
}

afterEach(() => {
  projects.remove();
});

describe('test console output on a node:test project', () => {
  it.each(LANGUAGES)(
    'reports a $extension warning the head prints and the base does not, with its test',
    async (language) => {
      expect(await newConsoleOutput(nodeTestProject(language, undefined))).toEqual([]);
      expect(await newConsoleOutput(nodeTestProject(language, 'Warning: leaked timer'))).toEqual([
        [
          'test-console-output',
          `test/pick.test.${language.extension}`,
          '"Warning: leaked timer" (test "says yes")',
        ],
      ]);
    },
  );
});
