import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { docsUrl } from '../../../../shared/messages/docs-url.mjs';
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
const routed = (rule, file) =>
  `If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
const unknownFolder = (file, line) =>
  `eslint-lint/nitpicker/no-unknown-main-folder src/main/${file}:${String(line)} ` +
  `'${file.split('/')[0]}/' is not a layer of this layout. ${UNKNOWN_FOLDER_ADVICE} ` +
  routed('nitpicker/no-unknown-main-folder', `src/main/${file}`);
const unusedFile = (file) =>
  `dead-code/files src/main/${file} Unused file: src/main/${file}. ` +
  `Nothing imports it: delete it, or import it where it is needed. ${routed('files', `src/main/${file}`)}`;
const PLANTED_OUTPUT = [
  'Nitpicker quality snapshot',
  'Status: violations',
  'Enforceable findings: 31',
  'Descriptive findings: 2',
  'Tool errors: 0',
  '',
  'Per-tool counts:',
  'eslint-lint: total=14 enforceable=14 descriptive=0',
  'entry-points: total=1 enforceable=1 descriptive=0',
  'prettier-format: total=3 enforceable=3 descriptive=0',
  'typescript-typecheck: total=1 enforceable=1 descriptive=0',
  'duplicates: total=3 enforceable=1 descriptive=2',
  'dead-code: total=11 enforceable=11 descriptive=0',
  '',
  'Enforceable findings:',
  unusedFile('billing/adapters/charge.js'),
  unusedFile('billing/index.js'),
  unusedFile('dup/a.js'),
  unusedFile('dup/b.js'),
  unusedFile('features/greeting/domain/typed.js'),
  unusedFile('format/messy.cjs'),
  unusedFile('format/messy.js'),
  unusedFile('format/unformatted.ts'),
  unusedFile('lint/banned.js'),
  unusedFile('lint/mode.ts'),
  unusedFile('orders/place.js'),
  'duplicates/duplicate-clone src/main/dup/a.js:5 This code repeats src/main/dup/b.js:5 (12 lines). Keep one copy and call it from both places. If the repetition is intended, add src/main/dup/a.js or src/main/dup/b.js to "exclude" in nitpicker.config.json.',
  `entry-points/public-alternative-bypass src/main/orders/place.js Import src/main/billing/adapters/charge.js through src/main/billing/index.js (runtime). ${routed('public-alternative-bypass', 'src/main/orders/place.js')}`,
  unknownFolder('billing/adapters/charge.js', 5),
  unknownFolder('billing/index.js', 1),
  unknownFolder('dup/a.js', 5),
  unknownFolder('dup/b.js', 5),
  unknownFolder('format/messy.cjs', 1),
  unknownFolder('format/messy.js', 1),
  unknownFolder('format/unformatted.ts', 1),
  'eslint-lint/@typescript-eslint/no-unsafe-return src/main/lint/banned.js:7 Unsafe return of a value of type `any`. Give the value a JSDoc type at its source (`@param {string} name`, `@returns {Type}`, `@type {Type}`), or read fields of a legacy `any` value through one reader function whose parameter is `{unknown}` and that returns a typed object. If this is intended, add {"rule":"@typescript-eslint/no-unsafe-return","paths":["src/main/lint/banned.js"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
  'eslint-lint/nitpicker/no-comments src/main/lint/banned.js:1 JSDoc holds types only: remove the description text and put the intent in a descriptive identifier or a named function. If this is intended, add {"rule":"nitpicker/no-comments","paths":["src/main/lint/banned.js"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
  unknownFolder('lint/banned.js', 6),
  'eslint-lint/no-var src/main/lint/banned.js:10 Unexpected var, use let or const instead. If this is intended, add {"rule":"no-var","paths":["src/main/lint/banned.js"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
  unknownFolder('lint/mode.ts', 1),
  'eslint-lint/no-restricted-syntax src/main/lint/mode.ts:1 Do not declare an `enum`. Use a union of string literals: `type Mode = \'read\' | \'write\'`. If this is intended, add {"rule":"no-restricted-syntax","paths":["src/main/lint/mode.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
  unknownFolder('orders/place.js', 1),
  'prettier-format/prettier/prettier src/main/format/messy.cjs:1 Format these lines with Prettier',
  'prettier-format/prettier/prettier src/main/format/messy.js:1 Format these lines with Prettier',
  'prettier-format/prettier/prettier src/main/format/unformatted.ts:1 Format these lines with Prettier',
  "typescript-typecheck/TS2345 src/main/features/greeting/domain/typed.js:9 Argument of type 'number' is not assignable to parameter of type 'string'.",
  '',
  'Descriptive findings:',
  'duplicates/duplicate-clone-size src/main/dup/a.js:5 Duplicate with src/main/dup/b.js',
  'duplicates/duplicate-clone-size src/main/dup/a.js:5 Duplicate with src/main/dup/b.js',
  '',
  `Rule reference: ${docsUrl('docs/rules/README.md')} (nitpicker explain <tool/rule> prints one rule)`,
  '',
].join('\n');
const FAILING_COVERAGE_OUTPUT = [
  'Nitpicker quality snapshot',
  'Status: tool-error',
  'Enforceable findings: 0',
  'Descriptive findings: 0',
  'Tool errors: 1',
  '',
  'Per-tool counts:',
  'coverage: total=0 enforceable=0 descriptive=0',
  '',
  'Tool errors:',
  'coverage (head): 1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
  "  test/failing.test.js > fails on purpose: AssertionError: expected 'greeted' to be 'empty-name' // Object.is equality",
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

  describe('the analyzers that could not read JavaScript', () => {
    it('each report a problem planted in .js and .cjs files', () => {
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

      expect(summary.tools.map(({ name }) => name).sort()).toEqual([
        'dead-code',
        'duplicates',
        'entry-points',
        'eslint-lint',
        'prettier-format',
        'typescript-typecheck',
      ]);
      expect(stdoutText).toBe(PLANTED_OUTPUT);
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

      expect(stdoutText).toBe(FAILING_COVERAGE_OUTPUT);
      expect(exitCode).toBe(2);
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
            'Base: main (argument)',
            '',
            'Quality gate summary',
            '✓ No new enforceable violations',
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
        text.replace('empty = null', 'empty  =  null'),
      );

      expect(stdoutText).toBe(
        [
          'Base: main (argument)',
          '',
          'Quality gate summary',
          '✖ 1 new enforceable violation',
          '  eslint-lint/nitpicker/no-null: Use `undefined` for an absent value, and an optional field or parameter (`value?: T`) where it may be missing. `null` is only for strict comparison with a library value and the `JSON.stringify` replacer argument. An exception fits only when a framework or library requires it.',
          '    src/main/legacy.js:2:24',
          '    If this is intended, add {"rule":"nitpicker/no-null","paths":["src/main/legacy.js"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
          `Full diagnostics: ${sharedRoot}/reports/diff/report.txt`,
          '',
        ].join('\n'),
      );
      expect(exitCode).toBe(1);
    });
  });
});
