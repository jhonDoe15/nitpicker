import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_SOURCE,
  UNCOVERED_ELSE,
  rulesOf,
  runArea,
  createRunnerProjects,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const IMPORTS = "import { it } from 'node:test';\nimport assert from 'node:assert/strict';\n";

function nodeTestProject(files, test = 'node --test') {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test } },
    'src/main/pick.ts': PICK_SOURCE,
    ...files,
  });
}

afterEach(projects.remove);

describe('coverage on a node:test project', () => {
  it('runs the tests with node:test, then CRAP reads the coverage it wrote', async () => {
    const root = nodeTestProject({
      'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says yes', () => {\n  assert.equal(pick(true), 'yes');\n});\n`,
    });

    const coverage = await runArea('coverage', root);
    const crap = await runArea('crap', root);

    expect(coverage.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
    expect(crap.find(({ identity }) => identity.endsWith(':branchCoverage'))?.metric.value).toBe(
      50,
    );
  });

  it('names the failing test and the file that could not load', async () => {
    const root = nodeTestProject({
      'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says no', () => {\n  assert.equal(pick(true), 'no');\n});\n`,
      'test/broken.test.ts': "import { missing } from 'not-installed';\nmissing();\n",
    });

    const findings = await runArea('coverage', root);

    expect(rulesOf(findings)).toEqual(['tool-error:tests-failed']);
    expect(findings[0].message).toMatch(/test\/pick\.test\.ts > says no: /u);
    expect(findings[0].message).toMatch(
      /test\/broken\.test\.ts > could not run: Error \[ERR_MODULE_NOT_FOUND\]: Cannot find package 'not-installed'/u,
    );
  });

  it('also runs the test files the test script names', async () => {
    const root = nodeTestProject(
      {
        'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says yes', () => {\n  assert.equal(pick(true), 'yes');\n});\n`,
        'checks/no.check.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says no', () => {\n  assert.equal(pick(false), 'no');\n});\n`,
      },
      'node --test "checks/*.check.ts"',
    );

    const findings = await runArea('coverage', root);

    expect(findings.filter(({ rule }) => rule === 'changed-branch-coverage')).toEqual([]);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(2);
  });

  it('maps the coverage of code tsx rewrote back to the TypeScript file', async () => {
    const root = nodeTestProject(
      {
        'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick';\nit('says yes', () => {\n  assert.equal(pick(true), 'yes');\n});\n`,
      },
      'tsx --test test/pick.test.ts',
    );

    const findings = await runArea('coverage', root);

    expect(findings.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
  });
});
