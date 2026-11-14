import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { findingsSchemaErrors } from '../../../../core/diff/comparison/test-support/findings-schema-check.mjs';
import { maskedDiagnostics } from '../../../../core/diff/reporting/test-support/output-expectations.mjs';
import {
  createCleanProject,
  git,
  readReport,
  runNitpicker,
} from '../../../typescript/preset/clean-projects/test-support/clean-project.mjs';

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/js-clean');
const FIXTURE_TIMEOUT_MS = 300_000;
const SOURCE_FILES = 6;
const UNKNOWN_FOLDER_ADVICE =
  'Under src/main/ put code in features/<name>/ (domain/ for pure logic, adapters/ for I/O), ' +
  'in shared/ when several features need it, or in the composition root. ' +
  'An exception fits only when this folder is deliberate.';
const UNKNOWN_FOLDER_FILES = [
  ['billing/adapters/charge.js', 5],
  ['billing/index.js', 1],
  ['dup/a.js', 5],
  ['dup/b.js', 5],
  ['format/messy.cjs', 1],
  ['format/messy.js', 1],
  ['format/unformatted.ts', 1],
  ['lint/banned.js', 6],
  ['lint/mode.ts', 1],
  ['orders/place.js', 1],
];
const UNUSED_FILES = [
  'billing/adapters/charge.js',
  'billing/index.js',
  'dup/a.js',
  'dup/b.js',
  'features/greeting/domain/typed.js',
  'format/messy.cjs',
  'format/messy.js',
  'format/unformatted.ts',
  'lint/banned.js',
  'lint/mode.ts',
  'orders/place.js',
];
const routeTo = (rule, file) =>
  `    If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
const PLANTED_OUTPUT = [
  '',
  'Quality snapshot summary',
  '✖ 31 enforceable findings',
  '  by area: format 3 · types 1 · lint 26 · structure 1',
  '  prettier-format/prettier/prettier: These lines are not formatted with Prettier. Run `nitpicker --fix` to format the changed files; it skips a file that was already unformatted on the base, so format such lines by hand.',
  '    src/main/format/messy.cjs:1',
  '    src/main/format/messy.js:1',
  '    src/main/format/unformatted.ts:1',
  "  typescript-typecheck/TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
  '    src/main/features/greeting/domain/typed.js:9:33',
  `  eslint-lint/nitpicker/no-unknown-main-folder: ${UNKNOWN_FOLDER_ADVICE}`,
  ...UNKNOWN_FOLDER_FILES.map(
    ([file, line]) =>
      `    src/main/${file}:${String(line)}:1 '${file.split('/')[0]}/' is not a layer of this layout.`,
  ),
  routeTo('nitpicker/no-unknown-main-folder', '<path>'),
  '  dead-code/files: Nothing imports it. Delete it, or import it where it is needed.',
  ...UNUSED_FILES.map((file) => `    src/main/${file} Unused file: src/main/${file}.`),
  routeTo('files', '<path>'),
  '  eslint-lint/nitpicker/no-comments: JSDoc holds types only: remove the description text and put the intent in a descriptive identifier or a named function.',
  '    src/main/lint/banned.js:1:1',
  routeTo('nitpicker/no-comments', 'src/main/lint/banned.js'),
  '  eslint-lint/@typescript-eslint/no-unsafe-member-access: Unsafe use of the `any` value `value` in keep: it affects 1 place. Give the value a JSDoc type at its source (`@param {string} name`, `@returns {Type}`, `@type {Type}`), or read fields of a legacy `any` value through one reader function whose parameter is `{unknown}` and that returns a typed object.',
  '    src/main/lint/banned.js:6:22',
  routeTo('@typescript-eslint/no-unsafe-member-access', 'src/main/lint/banned.js'),
  '  eslint-lint/no-var: Unexpected var, use let or const instead.',
  '    src/main/lint/banned.js:10:1',
  routeTo('no-var', 'src/main/lint/banned.js'),
  "  eslint-lint/no-restricted-syntax: Do not declare an `enum`. Use a union of string literals: `type Mode = 'read' | 'write'`.",
  '    src/main/lint/mode.ts:1:8',
  routeTo('no-restricted-syntax', 'src/main/lint/mode.ts'),
  '  entry-points/public-alternative-bypass: Import src/main/billing/adapters/charge.js through src/main/billing/index.js (runtime).',
  '    src/main/orders/place.js',
  routeTo('public-alternative-bypass', 'src/main/orders/place.js'),
  '  duplicates/duplicate-clone: This code repeats src/main/dup/b.js:5 (12 lines). Keep one copy and call it from both places. If the repetition is intended, add src/main/dup/a.js or src/main/dup/b.js to "exclude" in nitpicker.config.json.',
  '    src/main/dup/a.js:5',
  'Design notes for review (not failing): 2 in the snapshot',
  '  duplicates/duplicate-clone-size src/main/dup/a.js:5 Duplicate with src/main/dup/b.js (lines 12)',
  '  duplicates/duplicate-clone-size src/main/dup/a.js:5 Duplicate with src/main/dup/b.js (tokens 126)',
  'By analyzer:',
  '  eslint-lint: 14 enforceable, 0 descriptive',
  '  entry-points: 1 enforceable, 0 descriptive',
  '  prettier-format: 3 enforceable, 0 descriptive',
  '  typescript-typecheck: 1 enforceable, 0 descriptive',
  '  duplicates: 1 enforceable, 2 descriptive',
  '  dead-code: 11 enforceable, 0 descriptive',
  'Ran only: eslint-lint, entry-points, prettier-format, typescript-typecheck, duplicates, dead-code. ' +
    'Run nitpicker without --analyzer before you finish.',
  'Full diagnostics: <path>',
  '',
].join('\n');
const FAILING_COVERAGE_OUTPUT = [
  '',
  'Quality snapshot summary',
  '✖ 1 test fails; coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
  "  test/failing.test.js:5 > fails on purpose: AssertionError: expected 'greeted' to be 'empty-name' // Object.is equality",
  'No enforceable findings in the checks that ran.',
  'By analyzer:',
  '  1 analyzer ran clean',
  'Ran only: coverage. Run nitpicker without --analyzer before you finish.',
  'Full diagnostics: <path>',
  '',
].join('\n');

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
  return charge(cents) + 1;
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

describe('the js-clean fixture project', () => {
  const temporaryRoots = [];
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function createProject(files = {}) {
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'js-clean', files });
    temporaryRoots.push(root);
    return root;
  }

  function runSnapshot(root, extraArguments = []) {
    const result = runNitpicker(root, [
      '--all',
      '--output',
      path.join(root, 'reports/snapshot'),
      ...extraArguments,
    ]);
    return {
      ...result,
      summary: readReport(root, 'reports/snapshot/summary.json'),
      toolErrors: readReport(root, 'reports/snapshot/tool-errors.json'),
      findings: readReport(root, 'reports/snapshot/findings.json'),
    };
  }

  it(
    'passes `nitpicker --all` with no enforceable findings',
    () => {
      const { exitCode, stderrText, summary, toolErrors, findings } = runSnapshot(createProject());

      expect(stderrText).toBe('');
      expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([]);
      expect(toolErrors).toEqual([]);
      expect(findingsSchemaErrors(findings)).toEqual([]);
      expect(summary.overallStatus).toBe('clean');
      expect(summary.tools.length).toBeGreaterThan(10);
      expect(
        findings.find(({ tool, identity }) => tool === 'crap' && identity === 'summary:files')
          ?.metric.value,
      ).toBe(SOURCE_FILES);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'passes `nitpicker --all` on the project once `nitpicker init` has written its config',
    () => {
      const root = createProject();
      rmSync(path.join(root, 'nitpicker.config.json'));

      const init = runNitpicker(root, ['init']);
      const { exitCode, stderrText, summary, toolErrors } = runSnapshot(root);

      expect(init.exitCode).toBe(0);
      expect(readFileSync(path.join(root, 'nitpicker.config.json'), 'utf8')).toBe(
        '{ "preset": "javascript" }\n',
      );
      expect(stderrText).toBe('');
      expect(toolErrors).toEqual([]);
      expect(summary.overallStatus).toBe('clean');
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  describe('the analyzers that could not read JavaScript', () => {
    it('each report a problem planted in .js and .cjs files', () => {
      const root = createProject(plantedProblems);

      const { exitCode, stdoutText, summary, findings } = runSnapshot(root, [
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

      expect(summary.tools.map(({ name }) => name).sort()).toEqual([
        'dead-code',
        'duplicates',
        'entry-points',
        'eslint-lint',
        'prettier-format',
        'typescript-typecheck',
      ]);
      expect(maskedDiagnostics(stdoutText)).toBe(PLANTED_OUTPUT);
      expect(findingsSchemaErrors(findings)).toEqual([]);
      expect(exitCode).toBe(1);
    });

    it(
      'leaves the React rule scope off even when package.json lists react',
      () => {
        const root = createProject({
          'package.json': JSON.stringify({
            name: 'js-clean-fixture',
            private: true,
            type: 'module',
            devDependencies: { vitest: '4.1.11' },
            dependencies: { react: '19.0.0' },
          }),
          'src/main/ui/panel.js':
            "import { Component } from 'react';\n\nexport class Panel extends Component {}\n",
        });

        const { toolErrors, findings } = runSnapshot(root, ['--analyzer', 'eslint-lint']);

        expect(toolErrors).toEqual([]);
        expect(
          findings.filter(({ rule }) => /^react/u.test(rule)).map(({ identity }) => identity),
        ).toEqual([]);
      },
      FIXTURE_TIMEOUT_MS,
    );

    it('reports a failing test as a tool error instead of crashing the coverage runner', () => {
      const root = createProject({
        'test/failing.test.js': `import { expect, it } from 'vitest';
import { greet } from '../src/main/features/greeting/domain/greet.js';

it('fails on purpose', () => {
  expect(greet('Ada').kind).toBe('empty-name');
});
`,
      });

      const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'coverage']);

      expect(maskedDiagnostics(stdoutText)).toBe(FAILING_COVERAGE_OUTPUT);
      expect(exitCode).toBe(1);
    });

    it(
      'fixes the changed .js files with ESLint and Prettier',
      () => {
        const root = createProject({ 'src/main/changed.js': 'export const changed = 1;\n' });
        writeFileSync(path.join(root, 'src/main/changed.js'), 'export let changed=3;\n');

        const { exitCode, stdoutText } = runNitpicker(root, [
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
        expect(stdoutText).toBe(
          [
            'Fixed files:',
            'src/main/changed.js',
            'Fix notes:',
            '  eslint --fix rewrote src/main/changed.js',
            '  prettier rewrote src/main/changed.js',
            'Base: main (argument)',
            '',
            'Quality gate summary',
            '✓ No new enforceable violations',
            'Ran only: eslint-lint, prettier-format. Run nitpicker without --analyzer before you finish.',
            `Full diagnostics: ${root}/reports/fix/report.txt`,
            '',
          ].join('\n'),
        );
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

    function legacyTarget() {
      return path.join(sharedRoot, 'src/main/legacy.js');
    }

    beforeAll(() => {
      sharedRoot = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'js-clean' });
      writeFileSync(legacyTarget(), legacy);
      git(sharedRoot, 'add', '-A');
      git(sharedRoot, 'commit', '-q', '-m', 'legacy violation');
    });

    afterAll(() => {
      rmSync(sharedRoot, { recursive: true, force: true });
    });

    function runDifference(branch, edit) {
      git(sharedRoot, 'switch', '-q', '-f', '-c', branch, 'main');
      writeFileSync(legacyTarget(), edit(legacy));
      const result = runNitpicker(sharedRoot, [
        '--base',
        'main',
        '--analyzer',
        'eslint-lint',
        '--output',
        'reports/diff',
      ]);
      return { ...result, summary: readReport(sharedRoot, 'reports/diff/summary.json') };
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

    it('fails when the edit touches the line of a legacy violation', () => {
      const { exitCode, stdoutText } = runDifference('touched', (text) =>
        text.replace('empty = null', 'unset = null'),
      );

      expect(stdoutText).toBe(
        [
          'Base: main (argument)',
          '',
          'Quality gate summary',
          '✖ 1 new enforceable violation',
          '  eslint-lint/nitpicker/no-null: Use `undefined` for an absent value, and an optional field or parameter (`value?: T`) where it may be missing. `null` is only for strict comparison with a library value and as a value in the data passed to `JSON.stringify` (an object field, an array element, or its replacer argument), where it is the JSON value for nothing. An exception fits only when a framework or library requires it.',
          '    src/main/legacy.js:2:22',
          '    If this is intended, add {"rule":"nitpicker/no-null","paths":["src/main/legacy.js"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
          'Ran only: eslint-lint. Run nitpicker without --analyzer before you finish.',
          `Full diagnostics: ${sharedRoot}/reports/diff/report.txt`,
          '',
        ].join('\n'),
      );
      expect(exitCode).toBe(1);
    });
  });
});
