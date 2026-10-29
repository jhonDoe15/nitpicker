import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EDITED_LINE_SENTENCE } from '../../../../core/diff/comparison/positions/touched-lines.mjs';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  createCleanProject,
  git,
  readReport,
  runNitpicker,
} from './test-support/clean-project.mjs';

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/strict-clean');
const BANNED_FORM_OUTPUT = [
  'Nitpicker quality snapshot',
  'Status: violations',
  'Enforceable findings: 1',
  'Descriptive findings: 0',
  'Tool errors: 0',
  '',
  'Per-tool counts:',
  'eslint-lint: total=1 enforceable=1 descriptive=0',
  '',
  'Enforceable findings:',
  'eslint-lint/no-restricted-syntax src/main/features/greeting/domain/greet.ts:21 Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed. If this is intended, add {"rule":"no-restricted-syntax","paths":["src/main/features/greeting/domain/greet.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
  '',
].join('\n');
const FIXTURE_TIMEOUT_MS = 300_000;

const lines = (...text) => `${text.join('\n')}\n`;
const WIDENED = "export const widened = ['a'] as readonly string[];";
const DOUBLED = 'const doubled = [1, 2].map((item) => item * 2);';
const TOTAL = 'export const total = doubled.reduce((sum, item) => sum + item, 0);';
const LOG = '  log([] as readonly string[]);';
const RUN = 'export function run(log: (value: readonly string[]) => void): void {';
const LOGGED = 'console.info([] as readonly string[]);';
const LEGACY = lines('export const first = 1;', WIDENED, 'export const last = 3;', '');
const LEGACY_FILES = {
  'src/main/legacy.ts': LEGACY,
  'src/main/moved.ts': lines(WIDENED, DOUBLED, TOTAL),
  'src/main/messy.ts': lines(
    'export const first = [ "a" ]   as readonly string[]',
    'export const second = [',
    '  "b",',
    '] as readonly string[]',
  ),
  'src/main/repeated.ts': lines(RUN, LOG, '  log([]);', LOG, '}'),
  'src/main/logged.ts': lines(LOGGED, 'console.info([]);', LOGGED),
};

describe('the strict-clean fixture project', () => {
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

  function createProject() {
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'strict-clean' });
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
      expect(summary.enforceableFindings).toBe(0);
      expect(summary.tools.length).toBeGreaterThan(10);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it('fails when a banned form is added, so the run above is a real check', () => {
    const root = createProject();
    const target = path.join(root, 'src/main/features/greeting/domain/greet.ts');
    writeFileSync(
      target,
      `${readFileSync(target, 'utf8')}\nexport const widened = ['a'] as readonly string[];\n`,
    );

    const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'eslint-lint']);

    expect(exitCode).toBe(1);
    expect(stdoutText).toBe(BANNED_FORM_OUTPUT);
  });

  describe('strict rules in touched code', () => {
    let sharedRoot;

    beforeAll(() => {
      sharedRoot = createCleanProject({
        fixtureRoot,
        gitTemplateRoot,
        name: 'strict-clean',
        files: LEGACY_FILES,
      });
    });

    afterAll(() => {
      rmSync(sharedRoot, { recursive: true, force: true });
    });

    function runBranch(branch, files) {
      git(sharedRoot, 'switch', '-q', '-f', '-c', branch, 'main');
      for (const [file, text] of Object.entries(files)) {
        writeFileSync(path.join(sharedRoot, file), text);
      }
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

    function runDifference(branch, edit) {
      return runBranch(branch, { 'src/main/legacy.ts': edit(LEGACY) });
    }

    function newStrictLines(branch, files) {
      runBranch(branch, files);
      return readReport(sharedRoot, 'reports/diff/new-findings.json')
        .filter(({ rule }) => rule === 'no-restricted-syntax')
        .map(({ path: file, location }) => `${file}:${String(location?.line)}`);
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

    it('fails when the edit changes the line of a legacy violation, and says why', () => {
      const { exitCode, stdoutText } = runDifference('touched', (text) =>
        text.replace('string[];', 'string[], extra = 1;'),
      );

      expect(stdoutText).toBe(
        [
          'Base: main (argument)',
          '',
          'Quality gate summary',
          '✖ 1 new enforceable violation',
          '  eslint-lint/no-restricted-syntax src/main/legacy.ts:2',
          [
            '    Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse)',
            'or give it the correct type at its source. `as const` is allowed.',
            EDITED_LINE_SENTENCE,
            'If this is intended, add',
            '{"rule":"no-restricted-syntax","paths":["src/main/legacy.ts"],"reason":"..."}',
            'to "exceptions" in nitpicker.config.json.',
          ].join(' '),
          `Full diagnostics: ${sharedRoot}/reports/diff/report.txt`,
          '',
        ].join('\n'),
      );
      expect(exitCode).toBe(1);
    });

    it('holds a legacy line that the diff shows moved past unchanged code to the rule', () => {
      const moved = newStrictLines('moved', {
        'src/main/moved.ts': lines(DOUBLED, TOTAL, '', WIDENED, 'export { doubled };'),
      });

      expect(moved).toEqual(['src/main/moved.ts:4']);
    });

    it('keeps legacy findings baselined when the formatter rewrites the file', () => {
      const formatted = newStrictLines('formatted', {
        'src/main/messy.ts': lines(
          "export const first = ['a'] as readonly string[];",
          "export const second = ['b'] as readonly string[];",
        ),
      });

      expect(formatted).toEqual([]);
    });

    it('reports a repeated finding on the line the change added, not on a legacy one', () => {
      const repeated = newStrictLines('repeated', {
        'src/main/repeated.ts': lines(RUN, LOG, '  log([]);', LOG, LOG, '}'),
        'src/main/logged.ts': lines(LOGGED, LOGGED, 'console.info([]);', LOGGED),
      });

      expect(repeated.toSorted()).toEqual(['src/main/logged.ts:2', 'src/main/repeated.ts:5']);
    });
  });
});
