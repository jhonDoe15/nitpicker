import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createProject as createFixtureProject,
  FIXTURE_TIMEOUT_MS,
  git,
  keepProject,
  removeProjects,
  run,
  runSnapshot,
} from './fixture-project.mjs';

const fixtureRoot = path.join(import.meta.dirname, 'js-clean');

afterEach(removeProjects);

const createProject = (files) => createFixtureProject(fixtureRoot, files);

const SOURCE_FILES = 6;

function crapMeasuredFiles({ findings }) {
  return findings.find(({ tool, identity }) => tool === 'crap' && identity === 'summary:files')
    ?.metric.value;
}

describe('the js-clean fixture project', () => {
  it(
    'passes `nitpicker --all` with no enforceable findings',
    () => {
      const { exitCode, stdoutText, stderrText, summary } = runSnapshot(createProject());

      expect(stderrText).toBe('');
      expect(stdoutText).toContain('Enforceable findings: 0');
      expect(stdoutText).toContain('Tool errors: 0');
      expect(summary.overallStatus).toBe('clean');
      expect(summary.tools.length).toBeGreaterThan(10);
      expect(crapMeasuredFiles(summary)).toBe(SOURCE_FILES);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );
});

const duplicatedBody = (name) => `/**
 * @param {readonly number[]} values
 * @returns {number}
 */
export function ${name}(values) {
  let total = 0;
  const squares = [];
  for (const value of values) {
    total += value;
    squares.push(value * value);
  }
  const mean = values.length === 0 ? 0 : total / values.length;
  const spread = squares.reduce((sum, square) => sum + Math.abs(square - mean), 0);
  const ranked = values.map((value, index) => value * (index + 1) + spread);
  return ranked.reduce((sum, value) => sum + value, mean);
}
`;

const plantedProblems = {
  'src/main/features/greeting/domain/typed.js': `/**
 * @param {string} name
 * @returns {number}
 */
export function nameLength(name) {
  return name.length;
}

export const wrong = nameLength(1);
`,
  'src/main/format/messy.js': 'export const   messy={a:1,b:2}\n',
  'src/main/format/messy.cjs': 'module.exports={a:1}\n',
  'src/main/format/unformatted.ts': 'export const   messy:number=1\n',
  'src/main/lint/mode.ts': 'export enum Mode {\n  On,\n}\n',
  'src/main/billing/adapters/charge.js': `/**
 * @param {number} cents
 * @returns {number}
 */
export function charge(cents) {
  return cents + 1;
}
`,
  'src/main/billing/index.js': "export { charge } from './adapters/charge.js';\n",
  'src/main/orders/place.js': `import { charge } from '../billing/adapters/charge.js';

/**
 * @param {number} cents
 * @returns {number}
 */
export function place(cents) {
  return charge(cents);
}
`,
  'src/main/dup/a.js': duplicatedBody('summarizeA'),
  'src/main/dup/b.js': duplicatedBody('summarizeB'),
  'src/main/lint/banned.js': `/**
 * Keeps the value.
 * @param {any} value
 * @returns {string | null}
 */
export function keep(value) {
  return value;
}

var legacyCounter = 1;
export const counter = legacyCounter;
`,
};

describe('the analyzers that could not read JavaScript', () => {
  it(
    'each report a problem planted in .js and .cjs files',
    () => {
      const root = createProject(plantedProblems);

      const { exitCode, stdoutText, summary } = runSnapshot(root, [
        '--analyzer',
        'typescript-typecheck',
        '--analyzer',
        'prettier-format',
        '--analyzer',
        'duplicates',
        '--analyzer',
        'entry-points',
        '--analyzer',
        'dead-code',
        '--analyzer',
        'eslint-lint',
      ]);

      expect(stdoutText).toContain('Tool errors: 0');
      expect(summary.tools.map(({ name }) => name).sort()).toEqual([
        'dead-code',
        'duplicates',
        'entry-points',
        'eslint-lint',
        'prettier-format',
        'typescript-typecheck',
      ]);
      expect(stdoutText).toContain(
        'typescript-typecheck/TS2345 src/main/features/greeting/domain/typed.js:9',
      );
      expect(stdoutText).toContain('prettier-format/prettier/prettier src/main/format/messy.js:1');
      expect(stdoutText).toContain('prettier-format/prettier/prettier src/main/format/messy.cjs:1');
      expect(stdoutText).toContain(
        'prettier-format/prettier/prettier src/main/format/unformatted.ts:1',
      );
      expect(stdoutText).toContain('eslint-lint/no-restricted-syntax src/main/lint/mode.ts:1');
      expect(stdoutText).toContain('duplicates/duplicate-clone src/main/dup/a.js:5');
      expect(stdoutText).toContain(
        'entry-points/public-alternative-bypass src/main/orders/place.js Import src/main/billing/adapters/charge.js through src/main/billing/index.js',
      );
      expect(stdoutText).toContain('dead-code/files src/main/format/messy.cjs');
      expect(stdoutText).toContain('eslint-lint/nitpicker/no-comments src/main/lint/banned.js:1');
      expect(stdoutText).toContain('eslint-lint/no-var src/main/lint/banned.js:');
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'reports a failing test as a tool error instead of crashing the coverage runner',
    () => {
      const root = createProject({
        'test/failing.test.js': `import { expect, it } from 'vitest';
import { greet } from '../src/main/features/greeting/domain/greet.js';

it('fails on purpose', () => {
  expect(greet('Ada').kind).toBe('empty-name');
});
`,
      });

      const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'coverage']);

      expect(stdoutText).toContain(
        'coverage (head): 1 test fails, so coverage, CRAP and mutation were skipped.',
      );
      expect(stdoutText).toContain('test/failing.test.js > fails on purpose: AssertionError');
      expect(exitCode).toBe(2);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'fixes the changed .js files with ESLint and Prettier',
    () => {
      const root = createProject({ 'src/main/changed.js': 'export const changed = 1;\n' });
      writeFileSync(path.join(root, 'src/main/changed.js'), 'export let changed=3;\n');

      const { exitCode, stdoutText } = run(root, [
        '--fix',
        '--base',
        'main',
        '--analyzer',
        'eslint-lint',
        '--analyzer',
        'prettier-format',
        '--output',
        path.join(root, 'reports/fix'),
      ]);

      expect(readFileSync(path.join(root, 'src/main/changed.js'), 'utf8')).toBe(
        'export const changed = 3;\n',
      );
      expect(stdoutText).toContain('Fixed files:\nsrc/main/changed.js\n');
      expect(exitCode, stdoutText).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );
});

describe('JavaScript rules in touched code', () => {
  const legacy = [
    'export const first = 1;',
    'export const empty = null;',
    'export const last = 3;',
    '',
  ].join('\n');

  let sharedRoot;
  const target = () => path.join(sharedRoot, 'src/main/legacy.js');
  beforeAll(() => {
    sharedRoot = createProject();
    keepProject(sharedRoot);
    writeFileSync(target(), legacy);
    git(sharedRoot, 'add', '-A');
    git(sharedRoot, 'commit', '-q', '-m', 'legacy violation');
  });
  afterAll(() => {
    rmSync(sharedRoot, { recursive: true, force: true });
  });

  function runDifference(branch, edit) {
    git(sharedRoot, 'switch', '-q', '-f', '-c', branch, 'main');
    writeFileSync(target(), edit(legacy));
    const result = run(sharedRoot, [
      '--base',
      'main',
      '--analyzer',
      'eslint-lint',
      '--output',
      'reports/diff',
    ]);
    const summary = JSON.parse(
      readFileSync(path.join(sharedRoot, 'reports/diff/summary.json'), 'utf8'),
    );
    return { ...result, summary };
  }

  it(
    'keeps a legacy violation baselined when the edit is elsewhere in the file',
    () => {
      const { exitCode, summary } = runDifference('elsewhere', (text) =>
        text.replace('first = 1', 'first = 2'),
      );

      expect(summary.newEnforceableFindings).toBe(0);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'fails when the edit touches the line of a legacy violation',
    () => {
      const { exitCode, stdoutText } = runDifference('touched', (text) =>
        text.replace('empty = null', 'empty  =  null'),
      );

      expect(stdoutText).toContain('Use `undefined` for an absent value');
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );
});
