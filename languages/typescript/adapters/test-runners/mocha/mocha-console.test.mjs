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

function mochaProject({ extension, source }, warning) {
  const call = warning === undefined ? '' : `    console.warn('${warning}');\n`;
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test: 'mocha' } },
    [`src/main/pick.${extension}`]: source,
    [`test/pick.test.${extension}`]: `import assert from 'node:assert/strict';\nimport { pick } from '../src/main/pick.${extension}';\ndescribe('pick', () => {\n  it('answers', () => {\n${call}    assert.equal(pick(true), 'yes');\n  });\n});\n`,
  });
}

afterEach(() => {
  projects.remove();
});

describe('test console output on a Mocha project', () => {
  it.each(LANGUAGES)(
    'reports a $extension warning the head prints and the base does not, with its test',
    async (language) => {
      expect(await newConsoleOutput(mochaProject(language, undefined))).toEqual([]);
      expect(await newConsoleOutput(mochaProject(language, 'Warning: leaked timer'))).toEqual([
        [
          'test-console-output',
          `test/pick.test.${language.extension}`,
          '"Warning: leaked timer" (test "pick answers")',
        ],
      ]);
    },
  );
});
