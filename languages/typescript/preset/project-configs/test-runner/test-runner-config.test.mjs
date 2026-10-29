import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateConfig } from '../../../../../core/configuration/validate.mjs';
import {
  PICK_SOURCE,
  createRunnerProjects,
  rulesOf,
  runArea,
} from '../../../adapters/test-runners/test-support/runner-project.mjs';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../../head-policy.mjs';
import { testsIgnoredNotices } from '../ignored-notices.mjs';
import { projectTestRetry, vitestRetryArguments } from './test-runner-config.mjs';

const projects = createRunnerProjects();

afterEach(() => {
  vi.unstubAllEnvs();
  projects.remove();
});

const ORDERINGS = [['nitpicker'], ['project'], ['project', 'nitpicker'], ['nitpicker', 'project']];
const EACH_ORDERING = ORDERINGS.map((precedence) => [precedence]);
const OPT_IN = ['project', 'nitpicker'];
const SECOND_ATTEMPT = 'let attempts = 0;\nconst secondAttempt = () => (attempts += 1) === 2;\n';

function vitestProject(files) {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test: 'vitest' } },
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
}

function mochaProject(files) {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test: 'mocha' } },
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
}

function headTests(root, precedence, runner) {
  const tests = { precedence, ...(runner === undefined ? {} : { runner }) };
  return resolveHeadPolicy({ tools: { tests } }, root).tools.tests;
}

async function coverageWith(root, precedence) {
  const policyFile = path.join(path.dirname(root), 'policy.json');
  writeFileSync(
    policyFile,
    JSON.stringify(resolveHeadPolicy({ tools: { tests: { precedence } } }, root)),
  );
  vi.stubEnv('NITPICKER_POLICY', policyFile);
  return rulesOf(await runArea('coverage', root)).filter((rule) => rule.endsWith('tests-failed'));
}

describe('the test runner config a project opts into', () => {
  it.each(EACH_ORDERING)(
    'retries a Vitest test as test.retry says only when %j puts the project first',
    async (precedence) => {
      const root = vitestProject({
        'vitest.config.mjs': 'export default { test: { retry: 1 } };\n',
      });

      expect(await coverageWith(root, precedence)).toEqual(
        precedence[0] === 'project' ? [] : ['tool-error:tests-failed'],
      );
    },
  );

  it.each(EACH_ORDERING)(
    'retries a Mocha test as .mocharc retries says only when %j puts the project first',
    async (precedence) => {
      const root = mochaProject({ '.mocharc.json': '{ "retries": 1 }' });

      expect(await coverageWith(root, precedence)).toEqual(
        precedence[0] === 'project' ? [] : ['tool-error:tests-failed'],
      );
    },
  );

  it('reads test.retry with its count, delay and condition from the head checkout', () => {
    const root = vitestProject({
      'vitest.config.ts':
        'const retry: object = { count: 2, delay: 5, condition: /flaky/ };\nexport default { test: { retry } };\n',
    });

    const tests = headTests(root, OPT_IN);
    expect(tests.projectConfig).toEqual({
      runner: 'vitest',
      retry: { count: 2, delay: 5, condition: { source: 'flaky', flags: '' } },
    });
    expect(projectTestRetry('vitest', tests)).toEqual(tests.projectConfig.retry);
    expect(vitestRetryArguments(projectTestRetry('vitest', tests))).toEqual([
      '--retry.count=2',
      '--retry.delay=5',
      '--retry.condition=flaky',
    ]);
    expect(vitestRetryArguments(1)).toEqual(['--retry=1']);
    expect(vitestRetryArguments(undefined)).toEqual([]);
    expect(projectTestRetry('vitest', { ...tests, precedence: ['nitpicker', 'project'] })).toBe(
      undefined,
    );
    expect(projectTestRetry('mocha', tests)).toBe(undefined);
  });

  it('copies the head checkout values onto the base policy', () => {
    const head = headTests(mochaProject({ '.mocharc.yml': 'retries: 3\n' }), OPT_IN);
    const base = withHeadCheckoutFacts(
      { tools: { tests: { precedence: OPT_IN, projectConfig: { runner: 'mocha', retry: 0 } } } },
      { tools: { tests: head } },
    );

    expect(base.tools.tests.projectConfig).toEqual({ runner: 'mocha', retry: 3 });
  });

  it('never reads the config without the opt-in', () => {
    const root = vitestProject({ 'vitest.config.mjs': 'throw new Error("read");\n' });

    expect(resolveHeadPolicy({}, root).tools?.tests).toBe(undefined);
    expect(headTests(root, ['nitpicker'])).toEqual({ precedence: ['nitpicker'] });
    expect(projectTestRetry('vitest', { precedence: ['nitpicker'] })).toBe(undefined);
  });

  it.each([
    [
      'no Vitest config',
      () => vitestProject({}),
      '"tools.tests.precedence" lists "project" but a vitest.config.* or vite.config.* is missing: create it, or remove "project" from tools.tests.precedence',
    ],
    [
      'a Vitest config that throws',
      () => vitestProject({ 'vitest.config.mjs': 'throw new Error("broken config");\n' }),
      /^vitest\.config\.mjs could not be loaded: .*broken config/u,
    ],
    [
      'a test.retry that is not a count',
      () => vitestProject({ 'vitest.config.mjs': 'export default { test: { retry: -1 } };\n' }),
      'test.retry in vitest.config.mjs is -1: it must be a whole number of 0 or more or { count, delay, condition } with a condition without flags',
    ],
    [
      'a test.retry condition with flags',
      () =>
        vitestProject({
          'vitest.config.mjs':
            'export default { test: { retry: { count: 1, condition: /x/i } } };\n',
        }),
      'test.retry in vitest.config.mjs is {"count":1,"condition":{"source":"x","flags":"i"}}: it must be a whole number of 0 or more or { count, delay, condition } with a condition without flags',
    ],
    [
      'no Mocha config',
      () => mochaProject({}),
      '"tools.tests.precedence" lists "project" but a .mocharc.* file or a "mocha" key in package.json is missing: create it, or remove "project" from tools.tests.precedence',
    ],
    [
      'Mocha retries that are not a count',
      () => mochaProject({ '.mocharc.json': '{ "retries": "often" }' }),
      "Mocha's retries is not a number: it must be a whole number of 0 or more",
    ],
  ])('makes %s a tool error of the test run', (_name, create, message) => {
    const tests = headTests(create(), OPT_IN);

    expect(tests.projectConfig).toBe(undefined);
    expect(tests.projectConfigError).toMatch(message);
    expect(() => projectTestRetry('vitest', tests)).toThrow(tests.projectConfigError);
  });

  it.each([
    ['jest', 'Jest'],
    ['node', 'node:test'],
  ])('rejects the opt-in for %s, whose config nitpicker reads as it is', (runner, name) => {
    const tests = headTests(vitestProject({}), OPT_IN, runner);

    expect(tests.projectConfigError).toBe(
      `"tools.tests.precedence" lists "project", but ${name} has no config option it changes: remove "project" from tools.tests.precedence`,
    );
  });

  it('accepts the four orderings next to the runner and rejects malformed ones', () => {
    for (const precedence of ORDERINGS) {
      const config = { tools: { tests: { runner: 'mocha', precedence } } };
      expect(validateConfig(config)).toEqual(config);
    }
    expect(() => validateConfig({ tools: { tests: { precedence: ['vitest'] } } })).toThrow(
      '"tools.tests.precedence" must list "project", "nitpicker" or both, each once, highest first',
    );
  });

  it('says which retries it ignores until the project opts in', () => {
    const root = mochaProject({
      'vitest.config.ts': 'export default { test: { retry: 2 } };\n',
      '.mocharc.yml': 'retries: 2\n',
      'package.json': { name: 'p', mocha: { retries: 1 } },
    });
    const notice = (setting) =>
      `Ignoring ${setting}; opt in with "tools": { "tests": { "precedence": ["project", "nitpicker"] } }`;

    expect(testsIgnoredNotices({ config: {}, projectRoot: root })).toEqual([
      notice('test.retry in vitest.config.ts'),
      notice('retries in .mocharc.yml'),
      notice('retries in package.json "mocha"'),
    ]);
    for (const config of [
      { tools: { tests: { precedence: ['project'] } } },
      { disable: ['coverage'] },
    ]) {
      expect(testsIgnoredNotices({ config, projectRoot: root })).toEqual([]);
    }
    expect(testsIgnoredNotices({ config: {}, projectRoot: vitestProject({}) })).toEqual([]);
  });
});
