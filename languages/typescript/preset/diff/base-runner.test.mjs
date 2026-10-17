import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBaseSetupResolver } from '../../../../core/command/policy-review/base-setup.mjs';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { defaultTestFiles } from '../test-runner/test-files/test-file-patterns.mjs';
import { withBaseTestRunner } from './base-runner.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-base-runner-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const JEST_BASE = { 'package.json': '{"scripts":{"test":"jest --ci"}}' };
const VITEST_HEAD = { tools: { tests: { detectedRunner: 'vitest' } } };
const analyzer = (name) => ({ name });
const ANALYZERS = ['eslint-lint', 'coverage', 'crap', 'mutation'].map(analyzer);

function baseSetup(setup, context) {
  const warnings = [];
  const result = withBaseTestRunner(setup, {
    analyzers: ANALYZERS,
    liveProjectRoot: PACKAGE_ROOT,
    warn: (message) => warnings.push(message),
    ...context,
  });
  return { result, warnings };
}

describe('the test runner of the base snapshot', () => {
  it('changes nothing for a preset without a test runner', () => {
    const baseProjectRoot = projectWith(JEST_BASE);

    expect(baseSetup({}, { headPolicy: { tools: {} }, baseProjectRoot })).toEqual({
      result: {},
      warnings: [],
    });
  });

  it('changes nothing when the base shows the head runner', () => {
    const baseProjectRoot = projectWith({ 'package.json': '{"scripts":{"test":"vitest"}}' });

    expect(baseSetup({}, { headPolicy: VITEST_HEAD, baseProjectRoot })).toEqual({
      result: {},
      warnings: [],
    });
  });

  it('runs the base with its own runner when that runner is installed', () => {
    const baseProjectRoot = projectWith(JEST_BASE);

    expect(baseSetup({}, { headPolicy: VITEST_HEAD, baseProjectRoot })).toEqual({
      result: {
        headPolicy: {
          tools: {
            tests: {
              detectedRunner: 'jest',
              snapshotRunner: 'jest',
              testFiles: defaultTestFiles('jest'),
            },
          },
        },
      },
      warnings: [],
    });
  });

  it('measures the base with the test files of its own runner and checkout', () => {
    const baseProjectRoot = projectWith({
      'package.json': '{"scripts":{"test":"node --test checks/*.js"}}',
    });
    const headPolicy = {
      tools: {
        tests: {
          detectedRunner: 'vitest',
          testFiles: defaultTestFiles('vitest'),
          notices: ['a head notice'],
        },
      },
    };

    expect(baseSetup({}, { headPolicy, baseProjectRoot }).result.headPolicy.tools.tests).toEqual({
      detectedRunner: 'node',
      snapshotRunner: 'node',
      testFiles: { include: ['checks/*.js'], exclude: [], includeRegexes: [], excludeRegexes: [] },
    });
  });

  it('detects the base runner from the base checkout alone, not the head test files', () => {
    const baseProjectRoot = projectWith({
      'package.json': '{"devDependencies":{"vitest":"4","jest":"30"}}',
      'test/greeting.js': "import test from 'node:test';\n",
    });
    const headPolicy = {
      tools: { tests: { detectedRunner: 'vitest', testFiles: defaultTestFiles('vitest') } },
    };

    expect(baseSetup({}, { headPolicy, baseProjectRoot }).result.headPolicy.tools.tests).toEqual({
      detectedRunner: 'node',
      snapshotRunner: 'node',
      testFiles: defaultTestFiles('node'),
    });
  });

  it('leaves coverage and CRAP out of the base when its runner is not installed', () => {
    const baseProjectRoot = projectWith({ 'package.json': '{"scripts":{"test":"mocha"}}' });

    expect(
      baseSetup({}, { headPolicy: VITEST_HEAD, baseProjectRoot, liveProjectRoot: projectWith({}) }),
    ).toEqual({
      result: { headPolicy: VITEST_HEAD, analyzers: ['eslint-lint', 'mutation'].map(analyzer) },
      warnings: [
        'The base runs its tests with Mocha and the head with Vitest, but mocha is not installed, so coverage and CRAP are not compared on this change.',
      ],
    });
  });

  it('keeps the head runner when the base evidence is balanced', () => {
    const baseProjectRoot = projectWith({
      'package.json': '{"devDependencies":{"jest":"30","mocha":"11"}}',
    });

    expect(baseSetup({}, { headPolicy: VITEST_HEAD, baseProjectRoot })).toEqual({
      result: {},
      warnings: [],
    });
  });

  it('follows the runner the base config names', () => {
    const baseProjectRoot = projectWith({});
    const own = { exclude: [], tools: { tests: { runner: 'node' } } };

    expect(baseSetup({ headPolicy: own }, { headPolicy: VITEST_HEAD, baseProjectRoot })).toEqual({
      result: {
        headPolicy: {
          exclude: [],
          tools: {
            tests: {
              detectedRunner: 'node',
              runner: 'node',
              snapshotRunner: 'node',
              testFiles: defaultTestFiles('node'),
            },
          },
        },
      },
      warnings: [],
    });
  });
});

describe('a base config without a test runner', () => {
  const { createGitRepository } = useGitFixtures();

  it('inherits the runner the head config names', () => {
    const { root } = createGitRepository({
      ...JEST_BASE,
      'nitpicker.config.json': '{ "thresholds": { "fileLines": 400 } }\n',
    });
    const headPolicy = { tools: { tests: { runner: 'vitest', detectedRunner: 'jest' } } };
    const resolve = createBaseSetupResolver({
      headConfig: { tools: { tests: { runner: 'vitest' } } },
      headPolicy,
      liveProjectRoot: PACKAGE_ROOT,
      injectedAnalyzers: [],
    });

    const setup = resolve({ baseProjectRoot: root, headSnapshotRoot: root, analyzers: [] });

    expect(setup.headPolicy.tools).toEqual(headPolicy.tools);
  });
});
