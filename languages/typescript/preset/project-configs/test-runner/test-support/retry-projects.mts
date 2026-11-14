import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { resolveHeadPolicy } from '../../test-support/policy-views.mts';
import type { ToolSettings } from '../../test-support/policy-views.mts';
import { PICK_SOURCE, createRunnerProjects, rulesOf, runArea } from './runner-views.mts';
import type { ProjectFiles } from './runner-views.mts';

export const OPT_IN = ['project', 'nitpicker'];
export const TESTS_FAILED = ['tool-error:tests-failed'];
const TEST_RUN_FAILURE = /:tests-(?:failed|not-run)$/u;
const SECOND_ATTEMPT = 'let attempts = 0;\nconst secondAttempt = () => (attempts += 1) === 2;\n';

type RetryProjects = {
  remove(): void;
  vitestProject(files: ProjectFiles): string;
  mochaProject(files: ProjectFiles, test?: string): string;
  plainProject(files: ProjectFiles, options?: { linkDependencies?: false }): string;
  headTests(root: string, precedence: string[], runner?: string): ToolSettings;
  coverageWith(root: string, precedence: string[]): Promise<string[]>;
};

function packageFile(test: string) {
  return { name: 'p', type: 'module', scripts: { test } };
}

export function createRetryProjects(): RetryProjects {
  const projects = createRunnerProjects();
  return {
    remove() {
      vi.unstubAllEnvs();
      projects.remove();
    },
    vitestProject(files: ProjectFiles): string {
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
    mochaProject(files: ProjectFiles, test = 'mocha'): string {
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
    plainProject(files: ProjectFiles, options?: { linkDependencies?: false }): string {
      return projects.project(files, options);
    },
    headTests(root: string, precedence: string[], runner?: string): ToolSettings {
      const tests = { precedence, ...(runner === undefined ? {} : { runner }) };
      return resolveHeadPolicy({ tools: { tests } }, root).tools.tests;
    },
    async coverageWith(root: string, precedence: string[]): Promise<string[]> {
      const policyFile = path.join(path.dirname(root), 'policy.json');
      writeFileSync(
        policyFile,
        JSON.stringify(resolveHeadPolicy({ tools: { tests: { precedence } } }, root)),
      );
      vi.stubEnv('NITPICKER_POLICY', policyFile);
      return rulesOf(await runArea('coverage', root)).filter((rule) => TEST_RUN_FAILURE.test(rule));
    },
  };
}
