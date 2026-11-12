import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vi } from 'vitest';
import {
  PICK_SOURCE,
  createRunnerProjects,
  rulesOf,
  runArea,
} from '../../../../adapters/test-runners/test-support/runner-project.mjs';
import { resolveHeadPolicy } from '../../../head-policy.mjs';
import { withProjectTestFiles } from '../../../test-runner/test-files/project-test-files.mjs';

export const OPT_IN = ['project', 'nitpicker'];
const MOCHA_TESTS = "mocha 'test/**/*.test.ts'";
export const TESTS_FAILED = ['tool-error:tests-failed'];
const COVERAGE_ANALYZER = { name: 'coverage', policyFromPackage: true };
const TEST_RUN_FAILURE = /:tests-(?:failed|not-run)$/u;
const SECOND_ATTEMPT = 'let attempts = 0;\nconst secondAttempt = () => (attempts += 1) === 2;\n';

function packageFile(test) {
  return { name: 'p', type: 'module', scripts: { test } };
}

export function createRetryProjects() {
  const projects = createRunnerProjects();
  return {
    remove() {
      vi.unstubAllEnvs();
      projects.remove();
    },
    vitestProject(files) {
      return projects.project({
        'package.json': packageFile('vitest'),
        'src/main/pick.ts': PICK_SOURCE,
        'test/pick.test.ts': [
          "import { expect, it } from 'vitest';",
          "import { pick } from '../src/main/pick.ts';",
          SECOND_ATTEMPT,
          "it('says yes on the second attempt', () => {",
          '  expect(secondAttempt()).toBe(true);',
          "  expect(pick(true)).toBe('yes');",
          '});',
          '',
        ].join('\n'),
        ...files,
      });
    },
    mochaProject(files, test = MOCHA_TESTS) {
      return projects.project({
        'package.json': packageFile(test),
        'src/main/pick.ts': PICK_SOURCE,
        'test/pick.test.ts': [
          "import assert from 'node:assert/strict';",
          "import { pick } from '../src/main/pick.ts';",
          SECOND_ATTEMPT,
          "describe('pick', () => {",
          "  it('says yes on the second attempt', () => {",
          '    assert.equal(secondAttempt(), true);',
          "    assert.equal(pick(true), 'yes');",
          '  });',
          '});',
          '',
        ].join('\n'),
        ...files,
      });
    },
    plainProject(files, options) {
      return projects.project(files, options);
    },
    headTests(root, precedence, runner) {
      const tests = { precedence, ...(runner === undefined ? {} : { runner }) };
      return resolveHeadPolicy({ tools: { tests } }, root).tools.tests;
    },
    async coverageWith(root, precedence) {
      const policyFile = path.join(path.dirname(root), 'policy.json');
      const policy = withProjectTestFiles(
        resolveHeadPolicy({ tools: { tests: { precedence } } }, root),
        { projectRoot: root, liveProjectRoot: root, analyzers: [COVERAGE_ANALYZER] },
      );
      await writeFile(policyFile, JSON.stringify(policy));
      vi.stubEnv('NITPICKER_POLICY', policyFile);
      return rulesOf(await runArea('coverage', root)).filter((rule) => TEST_RUN_FAILURE.test(rule));
    },
  };
}
