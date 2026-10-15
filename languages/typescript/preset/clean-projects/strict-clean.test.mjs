import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/fixtures/git-repository.mjs';
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
  'eslint-lint/no-restricted-syntax src/main/features/greeting/domain/greet.ts:29 Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
  '',
].join('\n');
const FIXTURE_TIMEOUT_MS = 300_000;

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

  it(
    'fails when a banned form is added, so the run above is a real check',
    () => {
      const root = createProject();
      const target = path.join(root, 'src/main/features/greeting/domain/greet.ts');
      writeFileSync(
        target,
        `${readFileSync(target, 'utf8')}\nexport const widened = ['a'] as readonly string[];\n`,
      );

      const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'eslint-lint']);

      expect(exitCode).toBe(1);
      expect(stdoutText).toBe(BANNED_FORM_OUTPUT);
    },
    FIXTURE_TIMEOUT_MS,
  );

  describe('strict rules in touched code', () => {
    const legacy = [
      'export const first = 1;',
      "export const widened = ['a'] as readonly string[];",
      'export const last = 3;',
      '',
    ].join('\n');
    let sharedRoot;

    function legacyTarget() {
      return path.join(sharedRoot, 'src/main/legacy.ts');
    }

    beforeAll(() => {
      sharedRoot = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'strict-clean' });
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

    it(
      'fails when the edit touches the line of a legacy violation',
      () => {
        const { exitCode, stdoutText } = runDifference('touched', (text) =>
          text.replace('] as', ']  as'),
        );

        expect(stdoutText).toBe(
          [
            'Base: main (argument)',
            '',
            'Quality gate summary',
            '✖ 1 new enforceable violation',
            '  eslint-lint/no-restricted-syntax src/main/legacy.ts:2',
            '    Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
            `Full diagnostics: ${sharedRoot}/reports/diff/report.txt`,
            '',
          ].join('\n'),
        );
        expect(exitCode).toBe(1);
      },
      FIXTURE_TIMEOUT_MS,
    );
  });
});
