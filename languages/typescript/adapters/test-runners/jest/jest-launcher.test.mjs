import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { testTimeoutMs } from '../test-run.mjs';
import { createRunnerProjects } from '../test-support/runner-project.mjs';
import { coverageArguments } from './jest-coverage.mjs';
import { jestArguments } from './jest-arguments.mjs';
import { runJest } from './jest.mjs';

const projects = createRunnerProjects();

const ARGV_FILE = 'launcher-argv.jsonl';

const FAKE_REACT_SCRIPTS = [
  "const { appendFileSync } = require('node:fs');",
  "const { spawnSync } = require('node:child_process');",
  "const path = require('node:path');",
  'const tokens = process.argv.slice(2);',
  `appendFileSync(path.join(__dirname, '../../..', '${ARGV_FILE}'), JSON.stringify(tokens) + '\\n');`,
  `const jest = ${JSON.stringify(path.join(PACKAGE_ROOT, 'node_modules/jest/bin/jest.js'))};`,
  "const result = spawnSync(process.execPath, [jest, ...tokens.slice(1)], { stdio: 'inherit' });",
  'process.exit(result.status);',
  '',
].join('\n');

const PICK_JS = [
  'exports.pick = (flag) => {',
  '  if (flag) {',
  "    return 'yes';",
  '  }',
  "  return 'no';",
  '};',
  '',
].join('\n');

function launchedProject(files) {
  return projects.project(
    {
      'package.json': { name: 'p', private: true, scripts: { test: 'react-scripts test' } },
      'src/main/pick.js': PICK_JS,
      'test/pick.test.js': [
        "const { pick } = require('../src/main/pick');",
        "it('answers', () => {\n  expect(pick(true)).toBe('yes');\n});\n",
      ].join('\n'),
      ...files,
    },
    { linkDependencies: false },
  );
}

function optionsFor(root) {
  return {
    projectRoot: root,
    liveProjectRoot: root,
    policyRoot: PACKAGE_ROOT,
    kind: 'coverage',
    analyzerName: 'coverage',
  };
}

function command(launcher, tokens) {
  return { environment: {}, nodeArguments: [], arguments_: tokens, launcher };
}

afterEach(() => {
  projects.remove();
});

describe('the Jest command line', () => {
  it('disables configured coverage when rerunning a slow test', () => {
    const root = projects.project({
      'package.json': {
        name: 'p',
        private: true,
        jest: { collectCoverage: true, coverageProvider: 'babel', coverageReporters: ['json'] },
      },
      'src/value.js': 'exports.value = () => 42;',
      'test/value.test.js': [
        "const { value } = require('../src/value');",
        "test('uncovered', () => {",
        '  expect(value()).toBe(42);',
        '  expect(global.__coverage__).toBeUndefined();',
        '});',
      ].join('\n'),
    });
    const run = runJest(
      {
        ...optionsFor(root),
        liveProjectRoot: PACKAGE_ROOT,
        rerun: { files: [path.join(root, 'test/value.test.js')], namePattern: '^uncovered$' },
      },
      command(undefined, []),
    );

    expect([run.failed, run.report.numTotalTests, existsSync(path.join(root, 'coverage'))]).toEqual(
      [false, 1, false],
    );
  });

  it('drops the options that narrow the run to some of the tests', () => {
    const tokens = [
      ...['--shard=1/2', '--shard', '2/3', '-t', 'parse', '--testNamePattern=x'],
      ...['--findRelatedTests', 'src/a.ts', 'src/b.ts', '--lastCommit', '--onlyFailures'],
      ...['--changedFilesWithAncestor', '--listTests', '--clearCache'],
      ...['--selectProjects', 'unit', '--runInBand'],
    ];

    expect(
      jestArguments(command(undefined, tokens), ['--ci'], { leading: [], trailing: [] }),
    ).toEqual(['--selectProjects', 'unit', '--runInBand', '--ci']);
  });
});

describe('a Jest run that a Create React App script starts', () => {
  it('runs the project react-scripts with the Jest options nitpicker sets, serially when asked', () => {
    const root = launchedProject({
      'node_modules/react-scripts/package.json': { name: 'react-scripts', version: '5.0.1' },
      'node_modules/react-scripts/bin/react-scripts.js': FAKE_REACT_SCRIPTS,
    });
    const options = optionsFor(root);

    const run = runJest(
      options,
      command('react-scripts', ['--runInBand', '--testNamePattern=answers', '--watchAll']),
    );

    expect([run.failed, run.report.numTotalTests]).toEqual([false, 1]);
    expect(
      readFileSync(path.join(root, ARGV_FILE), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([
      ['test', '--runInBand', '--showConfig', '--watchAll=false'],
      [
        ...['test', '--runInBand', '--ci', '--no-watchman', '--passWithNoTests'],
        ...coverageArguments(options, root),
        '--silent=false',
        '--verbose=false',
        '--reporters=default',
        `--reporters=${path.join(PACKAGE_ROOT, 'languages/typescript/adapters/test-runners/jest/console-reporter.config.mjs')}`,
        ...['--json', `--outputFile=${path.join(root, '.nitpicker-diff-jest-report.json')}`],
        ...[
          '--testLocationInResults',
          `--testTimeout=${String(testTimeoutMs())}`,
          '--restoreMocks',
        ],
        '--watchAll=false',
      ],
    ]);
  });

  it('says which package to install when the launcher is missing', () => {
    const root = launchedProject({});

    expect(() => runJest(optionsFor(root), command('craco', []))).toThrow(
      new Error(
        `The test script runs "craco test", but @craco/craco is not installed in ${root}. ` +
          'Install the project dependencies, or set "tools.tests.runner" in nitpicker.config.json.',
      ),
    );
  });

  it.each([
    ['react-app-rewired', 'react-app-rewired', 'bin/index.js'],
    ['rescripts', '@rescripts/cli', 'bin/rescripts.js'],
  ])('starts Jest through %s, from the bin of %s', (launcher, packageName, bin) => {
    const packageFolder = `node_modules/${packageName}`;
    const depth = packageFolder.split('/').length + 1;
    const fake = FAKE_REACT_SCRIPTS.replace("'../../..'", `'${Array(depth).fill('..').join('/')}'`);
    const root = launchedProject({
      [`${packageFolder}/package.json`]: { name: packageName, version: '1.0.0' },
      [`${packageFolder}/${bin}`]: fake,
    });

    const run = runJest(optionsFor(root), command(launcher, []));

    expect([run.failed, run.report.numTotalTests]).toEqual([false, 1]);
    expect(() => runJest(optionsFor(launchedProject({})), command(launcher, []))).toThrow(
      /^The test script runs "[a-z-]+ test", but [@a-z/-]+ is not installed in /u,
    );
  });
});
