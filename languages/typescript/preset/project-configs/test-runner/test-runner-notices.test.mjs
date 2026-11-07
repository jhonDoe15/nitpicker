import { afterEach, describe, expect, it } from 'vitest';
import { testsIgnoredNotices } from './test-runner-notices.mjs';
import { createRetryProjects } from './test-support/retry-projects.mjs';

const projects = createRetryProjects();

afterEach(() => {
  projects.remove();
});

const OPT_IN = '"tools": { "tests": { "precedence": ["project", "nitpicker"] } }';
const notice = (setting) => `Ignoring ${setting}; opt in with ${OPT_IN}`;
const noticesOf = (root, config = {}) => testsIgnoredNotices({ config, projectRoot: root });
const retry = (value, file = 'vitest.config.ts') => ({
  [file]: `export default { test: { retry: ${value} } };\n`,
});
const inlineProject = (retryOption = '') =>
  `export default { test: { projects: [{ test: { name: 'unit', ${retryOption} include: ['test/**'] } }] } };\n`;

describe('the notice for test runner retries the project config sets', () => {
  it('names the Vitest test.retry until the project opts in', () => {
    const root = projects.vitestProject(retry('{ count: 2 }'));

    expect(noticesOf(root)).toEqual([notice('test.retry in vitest.config.ts')]);
    expect(noticesOf(root, { tools: { tests: { precedence: ['project'] } } })).toEqual([]);
    expect(noticesOf(root, { tools: { tests: { precedence: ['nitpicker', 'project'] } } })).toEqual(
      [],
    );
    expect(noticesOf(root, { disable: ['coverage'] })).toEqual([]);
  });

  it.each([
    ['a .mocharc.mjs', { '.mocharc.mjs': 'export default { retries: 2 };\n' }, '.mocharc.mjs'],
    ['a .mocharc.yml', { '.mocharc.yml': 'retries: 2\n' }, '.mocharc.yml'],
    [
      'the mocha key of package.json',
      { 'package.json': { name: 'p', scripts: { test: 'mocha' }, mocha: { retries: 2 } } },
      'package.json "mocha"',
    ],
  ])('names the Mocha retries of %s until the project opts in', (_name, files, file) => {
    const root = projects.mochaProject(files);

    expect(noticesOf(root)).toEqual([notice(`retries in ${file}`)]);
    expect(noticesOf(root, { tools: { tests: { precedence: ['project'] } } })).toEqual([]);
  });

  it('names nothing for a retry of 0 or a Mocha config without retries', () => {
    expect(noticesOf(projects.vitestProject(retry(0)))).toEqual([]);
    expect(noticesOf(projects.mochaProject({ '.mocharc.json': '{ "ui": "bdd" }' }))).toEqual([]);
  });

  it('looks only at the config of the runner that runs the tests', () => {
    const vitestOnly = projects.vitestProject({ '.mocharc.yml': 'retries: 2\n' });
    const mochaOnly = projects.mochaProject(retry(2));

    expect(noticesOf(vitestOnly)).toEqual([]);
    expect(noticesOf(mochaOnly)).toEqual([]);
  });

  it('never suggests the opt-in to a runner it cannot change', () => {
    const jest = projects.plainProject({
      'package.json': { name: 'p', scripts: { test: 'jest' } },
      ...retry(2),
      'jest.config.js': 'module.exports = {};\n',
    });
    const nodeTest = projects.plainProject({
      'package.json': { name: 'p', scripts: { test: 'node --test' } },
      ...retry(2),
    });

    expect(noticesOf(jest)).toEqual([]);
    expect(noticesOf(nodeTest)).toEqual([]);
  });

  it('is not fooled by a retry option that is not the test runner one', () => {
    const root = projects.vitestProject({
      'vite.config.ts':
        'export default { retry: false, define: { retry: 3 }, test: { include: ["test/**"] } };\n',
    });

    expect(noticesOf(root)).toEqual([]);
  });

  it('names a retry of a Vitest project, which no option applies, with or without the opt-in', () => {
    const root = projects.vitestProject({ 'vitest.config.ts': inlineProject('retry: 2,') });
    const ignored =
      'Ignoring test.retry of the Vitest project "unit" in vitest.config.ts; with the opt-in only test.retry of the root config applies, to every project';

    expect(noticesOf(root)).toEqual([ignored]);
    expect(noticesOf(root, { tools: { tests: { precedence: ['project'] } } })).toEqual([ignored]);
    expect(noticesOf(projects.vitestProject({ 'vitest.config.ts': inlineProject() }))).toEqual([]);
  });

  it('names nothing when the config cannot be loaded or does not exist', () => {
    expect(
      noticesOf(projects.vitestProject({ 'vitest.config.ts': 'throw new Error("broken");\n' })),
    ).toEqual([]);
    expect(noticesOf(projects.vitestProject({}))).toEqual([]);
  });
});
