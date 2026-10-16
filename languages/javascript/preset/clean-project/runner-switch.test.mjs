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

const FIXTURE_TIMEOUT_MS = 600_000;
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
const manifest = (fields) =>
  `${JSON.stringify({
    name: 'switch-fixture',
    private: true,
    type: 'module',
    exports: './src/main/features/greeting/index.js',
    ...fields,
  })}\n`;

function switchProject({ fixture, gitTemplateRoot }, baseFiles) {
  const fixtureRoot = path.join(import.meta.dirname, '../fixtures', fixture);
  const root = createCleanProject({
    fixtureRoot,
    gitTemplateRoot,
    name: 'runner-switch',
    files: baseFiles,
  });
  git(root, 'switch', '-q', '-c', 'switch');
  return root;
}

function compareWithMain(root, headFiles) {
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
});
