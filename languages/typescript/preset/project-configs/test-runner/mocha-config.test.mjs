import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { mochaConfigRetries } from './mocha-config.mjs';
import { OPT_IN, createRetryProjects } from './test-support/retry-projects.mjs';

const projects = createRetryProjects();

afterEach(() => {
  projects.remove();
});

function retriesOf(files, tokens = []) {
  const projectRoot = projects.plainProject(files);
  return mochaConfigRetries({ projectRoot, liveRoot: projectRoot, tokens });
}

describe('the Mocha options the project config loader reads', () => {
  it.each([
    ['a .mocharc.mjs', { '.mocharc.mjs': 'export default { retries: 4 };\n' }, 4],
    ['a .mocharc.yml', { '.mocharc.yml': 'retries: 3\n' }, 3],
    ['a commented .mocharc.jsonc', { '.mocharc.jsonc': '// flaky\n{ "retries": 2 }\n' }, 2],
    ['the mocha key of package.json', { 'package.json': { name: 'p', mocha: { retries: 5 } } }, 5],
    ['no retries at all', { '.mocharc.json': '{ "ui": "bdd" }' }, undefined],
  ])('reads the retries of %s', (_name, files, expected) => {
    expect(retriesOf(files)).toBe(expected);
  });

  it('lets the first rc file win in the order Mocha 12 looks for them', () => {
    expect(
      retriesOf({
        '.mocharc.json': '{ "retries": 1 }',
        '.mocharc.yml': 'retries: 2\n',
        '.mocharc.mjs': 'export default { retries: 3 };\n',
        '.mocharc.js': 'module.exports = { retries: 4 };\n',
      }),
    ).toBe(4);
  });

  it('follows the --config and --package options of the test script', () => {
    const files = {
      '.mocharc.json': '{ "retries": 1 }',
      'config/mocha.json': '{ "retries": 6 }',
      'config/manifest.json': '{ "mocha": { "retries": 7 } }',
      'package.json': { name: 'p', mocha: { retries: 2 } },
    };

    expect(retriesOf(files, ['--config', 'config/mocha.json'])).toBe(6);
    expect(retriesOf(files, ['--config=config/mocha.json'])).toBe(6);
    expect(retriesOf(files, ['--no-config', '--package', 'config/manifest.json'])).toBe(7);
    expect(retriesOf(files, ['--no-config', '--no-package'])).toBe(undefined);
  });

  it('ignores the retries, bail and forbid-only the gate drops from the script', () => {
    expect(
      retriesOf({ '.mocharc.json': '{ "retries": 2 }' }, ['--retries', '9', '--bail', 'test']),
    ).toBe(2);
  });

  it('reads a base checkout without dependencies with the Mocha of the live project', () => {
    const projectRoot = projects.plainProject(
      { '.mocharc.json': '{ "retries": 3 }' },
      { linkDependencies: false },
    );

    expect(mochaConfigRetries({ projectRoot, liveRoot: PACKAGE_ROOT, tokens: [] })).toBe(3);
    expect(() => mochaConfigRetries({ projectRoot, liveRoot: projectRoot, tokens: [] })).toThrow(
      `Mocha is not installed in ${projectRoot}, so its config cannot be read`,
    );
  });

  it('prints nothing of the rc file into the result', () => {
    expect(
      retriesOf({
        '.mocharc.cjs':
          'console.log(\'NITPICKER_PROJECT_CONFIG_RESULT {"value":{"retries":9}}\');\nconsole.log(\'noise\');\nmodule.exports = { retries: 2 };\n',
      }),
    ).toBe(2);
  });

  it.each([
    ['ends the process quietly', 'process.exit(0);\n', /it ended the process with exit code 0/u],
    ['throws', 'throw new Error("broken rc");\n', /Unable to read\/parse .*broken rc/u],
  ])('reports an rc file that %s', (_name, source, message) => {
    expect(() => retriesOf({ '.mocharc.cjs': source })).toThrow(message);
  });

  it('stops an rc file that never finishes', () => {
    const projectRoot = projects.plainProject({ '.mocharc.cjs': 'while (true) {}\n' });

    expect(() =>
      mochaConfigRetries({ projectRoot, liveRoot: projectRoot, tokens: [], timeoutMs: 1500 }),
    ).toThrow('the Mocha config did not finish loading within 1.5 s');
  });

  it('makes an rc file that ends the process a tool error instead of ending the run', () => {
    const root = projects.mochaProject({ '.mocharc.cjs': 'process.exit(0);\n' });

    const tests = projects.headTests(root, OPT_IN);

    expect(tests.projectConfig).toBe(undefined);
    expect(tests.projectConfigError).toBe(
      'the Mocha config could not be loaded: it ended the process with exit code 0',
    );
  });

  it('captures the retries of the config the test script names', () => {
    const root = projects.mochaProject(
      { 'config/mocha.json': '{ "retries": 3 }', '.mocharc.json': '{ "retries": 1 }' },
      'mocha --config config/mocha.json --retries 8',
    );

    expect(projects.headTests(root, OPT_IN).projectConfig).toEqual({ runner: 'mocha', retry: 3 });
  });
});
