import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  createCleanProject,
  git,
  readReport,
  runNitpicker,
} from '../../../typescript/preset/clean-projects/test-support/clean-project.mjs';

const FIXTURE_TIMEOUT_MS = 180_000;
const JEST_COMMAND = 'node --experimental-vm-modules node_modules/jest/bin/jest.js';
const VITEST_TEST = `import { describe, expect, it } from 'vitest';
import { greet, totalLength } from '../src/main/features/greeting/index.js';

describe('greeting', () => {
  it('greets a trimmed name', () => {
    expect(greet('  Ada ')).toEqual({ kind: 'greeted', text: 'Hello, Ada!' });
  });

  it('reports an empty name', () => {
    expect(greet('   ')).toEqual({ kind: 'empty-name' });
  });

  it('sums name lengths', () => {
    expect(totalLength(['Ada', 'Bo'])).toBe(5);
    expect(totalLength([])).toBe(0);
  });
});
`;
const NODE_TEST = `import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { greet, totalLength } from '../src/main/features/greeting/index.js';

describe('greeting', () => {
  it('greets a trimmed name', () => {
    assert.deepStrictEqual(greet('  Ada '), { kind: 'greeted', text: 'Hello, Ada!' });
  });

  it('reports an empty name', () => {
    assert.deepStrictEqual(greet('   '), { kind: 'empty-name' });
  });

  it('sums name lengths', () => {
    assert.strictEqual(totalLength(['Ada', 'Bo']), 5);
    assert.strictEqual(totalLength([]), 0);
  });
});
`;
const MOCHA_TEST = NODE_TEST.replace("from 'node:test'", "from 'mocha'");
const JEST_TEST = VITEST_TEST.replace("from 'vitest'", "from '@jest/globals'");
const SPEC_NAMED = 'test/greeting.test.js';
const PLAIN_NAMED = 'test/greeting.js';
const VITEST_CONFIG = 'export default {};\n';
const manifest = (fields) =>
  `${JSON.stringify({
    name: 'switch-fixture',
    private: true,
    type: 'module',
    exports: './src/main/features/greeting/index.js',
    ...fields,
  })}\n`;
const JEST_MANIFEST = manifest({
  scripts: { 'test:jest': JEST_COMMAND },
  devDependencies: { jest: '30.5.2', mocha: '12.0.3' },
});
const runnerConfig = (runner) =>
  `${JSON.stringify({ preset: 'javascript', tools: { tests: { runner } } })}\n`;

function removeFiles(root, names) {
  for (const name of names) {
    rmSync(path.join(root, name), { force: true });
  }
}

function switchProject({ fixture, gitTemplateRoot, removed = [] }, baseFiles) {
  const fixtureRoot = path.join(import.meta.dirname, '../fixtures', fixture);
  const root = createCleanProject({
    fixtureRoot,
    gitTemplateRoot,
    name: 'runner-switch',
    files: baseFiles,
  });
  if (removed.length > 0) {
    removeFiles(root, removed);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
  }
  git(root, 'switch', '-q', '-c', 'switch');
  return root;
}

function compareWithMain(root, headFiles, removed = []) {
  removeFiles(root, removed);
  for (const [name, text] of Object.entries(headFiles)) {
    writeFileSync(path.join(root, name), text);
  }
  const result = runNitpicker(root, [
    '--base',
    'main',
    '--analyzer',
    'coverage',
    '--analyzer',
    'crap',
    '--output',
    'reports/diff',
  ]);
  return {
    ...result,
    toolErrors: readReport(root, 'reports/diff/tool-errors.json'),
    newFindings: readReport(root, 'reports/diff/new-findings.json'),
  };
}

describe('a change that moves the tests to another runner', () => {
  const roots = [];
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it(
    'runs the base with the Jest its config names and the head with the Vitest its script runs',
    () => {
      const scripts = { test: 'vitest run', 'test:jest': JEST_COMMAND };
      const root = switchProject(
        { fixture: 'jest-project', gitTemplateRoot },
        {
          'package.json': manifest({
            scripts,
            devDependencies: { jest: '30.5.2', vitest: '4.1.11' },
          }),
          'nitpicker.config.json':
            '{ "preset": "javascript", "tools": { "tests": { "runner": "jest" } } }\n',
        },
      );
      roots.push(root);

      const { exitCode, stderrText, toolErrors, newFindings } = compareWithMain(root, {
        'nitpicker.config.json': '{ "preset": "javascript" }\n',
        'test/greeting.test.js': VITEST_TEST,
      });

      expect(stderrText).toBe('');
      expect(toolErrors).toEqual([]);
      expect(newFindings).toEqual([]);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'runs a node:test base with node:test when the head moves to a Vitest config',
    () => {
      const root = switchProject(
        { fixture: 'node-test-project', gitTemplateRoot },
        { 'package.json': manifest({}) },
      );
      roots.push(root);

      const { exitCode, stderrText, toolErrors, newFindings } = compareWithMain(root, {
        'vitest.config.mjs': 'export default {};\n',
        'test/greeting.test.js': VITEST_TEST,
      });

      expect(stderrText).toBe('');
      expect(toolErrors).toEqual([]);
      expect(newFindings).toEqual([]);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it.each([
    {
      name: 'a node:test test/greeting.js base and a Vitest test/greeting.test.js head',
      fixture: 'node-test-project',
      base: {
        files: { 'package.json': manifest({}), [PLAIN_NAMED]: NODE_TEST },
        removed: [SPEC_NAMED],
      },
      head: {
        files: { 'vitest.config.mjs': VITEST_CONFIG, [SPEC_NAMED]: VITEST_TEST },
        removed: [PLAIN_NAMED],
      },
    },
    {
      name: 'a Vitest test/greeting.test.js base and a node:test test/greeting.js head',
      fixture: 'node-test-project',
      base: {
        files: {
          'package.json': manifest({}),
          'vitest.config.mjs': VITEST_CONFIG,
          [SPEC_NAMED]: VITEST_TEST,
        },
        removed: [],
      },
      head: { files: { [PLAIN_NAMED]: NODE_TEST }, removed: ['vitest.config.mjs', SPEC_NAMED] },
    },
    {
      name: 'a Mocha test/greeting.js base and a Jest test/greeting.test.js head',
      fixture: 'jest-project',
      base: {
        files: {
          'package.json': JEST_MANIFEST,
          'nitpicker.config.json': runnerConfig('mocha'),
          [PLAIN_NAMED]: MOCHA_TEST,
        },
        removed: [SPEC_NAMED],
      },
      head: {
        files: { 'nitpicker.config.json': runnerConfig('jest'), [SPEC_NAMED]: JEST_TEST },
        removed: [PLAIN_NAMED],
      },
    },
    {
      name: 'a Jest test/greeting.test.js base and a Mocha test/greeting.js head',
      fixture: 'jest-project',
      base: {
        files: {
          'package.json': JEST_MANIFEST,
          'nitpicker.config.json': runnerConfig('jest'),
          [SPEC_NAMED]: JEST_TEST,
        },
        removed: [],
      },
      head: {
        files: { 'nitpicker.config.json': runnerConfig('mocha'), [PLAIN_NAMED]: MOCHA_TEST },
        removed: [SPEC_NAMED],
      },
    },
  ])(
    'measures $name with the test files of each side',
    ({ fixture, base, head }) => {
      const root = switchProject({ fixture, gitTemplateRoot, removed: base.removed }, base.files);
      roots.push(root);

      const { exitCode, stderrText, toolErrors, newFindings } = compareWithMain(
        root,
        head.files,
        head.removed,
      );

      expect(stderrText).toBe('');
      expect(toolErrors).toEqual([]);
      expect(newFindings).toEqual([]);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );
});
