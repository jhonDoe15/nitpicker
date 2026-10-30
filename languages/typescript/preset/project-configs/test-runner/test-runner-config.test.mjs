import { afterEach, describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../../core/configuration/validate.mjs';
import { withHeadCheckoutFacts } from '../../head-policy.mjs';
import { vitestRetryArguments } from './test-retry.mjs';
import { runArea } from '../../../adapters/test-runners/test-support/runner-project.mjs';
import { projectTestRetry } from './test-runner-config.mjs';
import { OPT_IN, TESTS_FAILED, createRetryProjects } from './test-support/retry-projects.mjs';

const projects = createRetryProjects();

afterEach(() => {
  projects.remove();
});

const ORDERINGS = [['nitpicker'], ['project'], ['project', 'nitpicker'], ['nitpicker', 'project']];
const EACH_ORDERING = ORDERINGS.map((precedence) => [precedence]);
const VITEST_FORM =
  'a whole number from 0 to 10 or { count, delay, condition } with a count from 0 to 10, ' +
  'a delay from 0 to 10000 ms and a condition that is a RegExp without flags';
const expectedFailures = (precedence) => (precedence[0] === 'project' ? [] : TESTS_FAILED);
const vitestRetry = (retry) => ({
  'vitest.config.mjs': `export default { test: { retry: ${retry} } };\n`,
});

describe('the test runner retries a project opts into', () => {
  it.each(EACH_ORDERING)(
    'retries a Vitest test as test.retry says only when %j puts the project first',
    async (precedence) => {
      const root = projects.vitestProject(vitestRetry(1));

      expect(await projects.coverageWith(root, precedence)).toEqual(expectedFailures(precedence));
    },
  );

  it.each(EACH_ORDERING)(
    'retries a Mocha test as .mocharc retries says only when %j puts the project first',
    async (precedence) => {
      const root = projects.mochaProject({ '.mocharc.json': '{ "retries": 1 }' });

      expect(await projects.coverageWith(root, precedence)).toEqual(expectedFailures(precedence));
    },
  );

  it.each([
    ['the mocha key of package.json', { 'package.json': { name: 'p', mocha: { retries: 1 } } }],
    ['a .mocharc.mjs', { '.mocharc.mjs': 'export default { retries: 1 };\n' }],
    [
      'the config the test script names',
      {
        'package.json': { name: 'p', scripts: { test: 'mocha --config config/mocha.json' } },
        'config/mocha.json': '{ "retries": 1 }',
        '.mocharc.json': '{ "retries": 0 }',
      },
    ],
  ])('retries a Mocha test as %s says', async (_name, files) => {
    const root = projects.mochaProject(files);

    expect(await projects.coverageWith(root, ['project'])).toEqual([]);
    expect(await projects.coverageWith(root, ['nitpicker'])).toEqual(TESTS_FAILED);
  });

  it('applies the root test.retry of Vitest to every project', async () => {
    const config = (retry, projectRetry) =>
      `export default { test: { ${retry}projects: [{ test: { name: 'unit', include: ['test/**/*.test.ts'], ${projectRetry} } }] } };\n`;

    expect(
      await projects.coverageWith(
        projects.vitestProject({ 'vitest.config.mjs': config('retry: 1, ', '') }),
        ['project'],
      ),
    ).toEqual([]);
    expect(
      await projects.coverageWith(
        projects.vitestProject({ 'vitest.config.mjs': config('', 'retry: 1') }),
        ['project'],
      ),
    ).toEqual(TESTS_FAILED);
  });

  it('keeps Mocha from bailing or forbidding .only through its rc file', async () => {
    const root = projects.mochaProject({
      '.mocharc.json': '{ "retries": 1, "bail": true, "forbid-only": true }',
      'test/pick.test.ts': [
        "import assert from 'node:assert/strict';",
        "describe('pick', () => {",
        "  it.only('is the only test', () => assert.equal(1, 1));",
        "  it('is skipped', () => assert.equal(1, 2));",
        '});',
        '',
      ].join('\n'),
    });

    expect(await projects.coverageWith(root, ['project'])).toEqual([]);
  });

  it('reports every failing Mocha test although the rc file bails', async () => {
    const failing = (name) => `  it('${name}', () => assert.equal(1, 2));`;
    const root = projects.mochaProject({
      '.mocharc.json': '{ "bail": true }',
      'test/pick.test.ts': [
        "import assert from 'node:assert/strict';",
        "describe('pick', () => {",
        failing('first'),
        failing('second'),
        '});',
        '',
      ].join('\n'),
    });

    const [finding] = await runArea('coverage', root);

    expect(finding.message).toBe(
      '2 tests fail, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
        '  test/pick.test.ts > pick first: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n' +
        '  test/pick.test.ts > pick second: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:',
    );
  });
});

describe('the retry captured from the head checkout', () => {
  it('reads test.retry with its count, delay and condition', () => {
    const root = projects.vitestProject({
      'vitest.config.ts':
        'const retry: object = { count: 2, delay: 5, condition: /flaky/ };\nexport default { test: { retry } };\n',
    });

    const tests = projects.headTests(root, OPT_IN);
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
    expect(projectTestRetry('mocha', tests)).toBe(undefined);
  });

  it('copies the head checkout values onto the base policy', () => {
    const head = projects.headTests(
      projects.mochaProject({ '.mocharc.yml': 'retries: 3\n' }),
      OPT_IN,
    );
    const base = withHeadCheckoutFacts(
      { tools: { tests: { precedence: OPT_IN, projectConfig: { runner: 'mocha', retry: 0 } } } },
      { tools: { tests: head } },
    );

    expect(base.tools.tests.projectConfig).toEqual({ runner: 'mocha', retry: 3 });
  });

  it('never reads the config without the opt-in or while nitpicker wins', () => {
    const root = projects.vitestProject({ 'vitest.config.mjs': 'throw new Error("read");\n' });

    expect(projects.headTests(root, ['nitpicker'])).toEqual({ precedence: ['nitpicker'] });
    expect(projects.headTests(root, ['nitpicker', 'project'])).toEqual({
      precedence: ['nitpicker', 'project'],
    });
    expect(projectTestRetry('vitest', { precedence: ['nitpicker'] })).toBe(undefined);
    expect(
      projectTestRetry('vitest', {
        precedence: ['nitpicker', 'project'],
        projectConfigError: 'unused',
      }),
    ).toBe(undefined);
  });

  it.each([
    [
      'no Vitest config',
      () => projects.vitestProject({}),
      '"tools.tests.precedence" lists "project" but a vitest.config.* or vite.config.* is missing: create it, or remove "project" from tools.tests.precedence',
    ],
    [
      'a Vitest config that throws',
      () => projects.vitestProject({ 'vitest.config.mjs': 'throw new Error("broken config");\n' }),
      'vitest.config.mjs could not be loaded: broken config',
    ],
    [
      'a test.retry that is not a count',
      () => projects.vitestProject(vitestRetry(-1)),
      `test.retry in vitest.config.mjs is -1: it must be ${VITEST_FORM}`,
    ],
    [
      'a test.retry count above the cap',
      () => projects.vitestProject(vitestRetry(11)),
      `test.retry in vitest.config.mjs is 11: it must be ${VITEST_FORM}`,
    ],
    [
      'a test.retry delay above the cap',
      () => projects.vitestProject(vitestRetry('{ count: 1, delay: 10001 }')),
      `test.retry in vitest.config.mjs is {"count":1,"delay":10001}: it must be ${VITEST_FORM}`,
    ],
    [
      'a test.retry condition with flags',
      () => projects.vitestProject(vitestRetry('{ count: 1, condition: /x/i }')),
      `test.retry in vitest.config.mjs is {"count":1,"condition":{"source":"x","flags":"i"}}: it must be ${VITEST_FORM}`,
    ],
    [
      'a test.retry condition that is a function',
      () => projects.vitestProject(vitestRetry('{ count: 1, condition: () => true }')),
      `test.retry in vitest.config.mjs is {"count":1,"condition":{"type":"function"}}: it must be ${VITEST_FORM}`,
    ],
    [
      'no Mocha config',
      () => projects.mochaProject({}),
      '"tools.tests.precedence" lists "project" but a .mocharc.* file or a "mocha" key in package.json is missing: create it, or remove "project" from tools.tests.precedence',
    ],
    [
      'Mocha retries that are not a count',
      () => projects.mochaProject({ '.mocharc.json': '{ "retries": "often" }' }),
      "Mocha's retries is not a number: it must be a whole number from 0 to 10",
    ],
    [
      'Mocha retries above the cap',
      () => projects.mochaProject({ '.mocharc.json': '{ "retries": 11 }' }),
      "Mocha's retries is 11: it must be a whole number from 0 to 10",
    ],
  ])('makes %s a tool error of the test run', (_name, create, message) => {
    const tests = projects.headTests(create(), OPT_IN);

    expect(tests.projectConfig).toBe(undefined);
    expect(tests.projectConfigError).toBe(message);
    expect(() => projectTestRetry('vitest', tests)).toThrow(tests.projectConfigError);
  });

  it.each([
    ['jest', 'Jest'],
    ['node', 'node:test'],
  ])('rejects the opt-in for %s, whose config nitpicker reads as it is', (runner, name) => {
    const tests = projects.headTests(projects.vitestProject({}), OPT_IN, runner);

    expect(tests.projectConfigError).toBe(
      `"tools.tests.precedence" lists "project", but ${name} has no config option it changes: remove "project" from tools.tests.precedence`,
    );
  });

  it.each(EACH_ORDERING)('accepts the ordering %j next to the runner', (precedence) => {
    const config = { tools: { tests: { runner: 'mocha', precedence } } };

    expect(validateConfig(config)).toEqual(config);
  });

  it('rejects a malformed ordering next to the runner', () => {
    expect(() => validateConfig({ tools: { tests: { precedence: ['vitest'] } } })).toThrow(
      '"tools.tests.precedence" must list "project", "nitpicker" or both, each once, highest first',
    );
  });
});
