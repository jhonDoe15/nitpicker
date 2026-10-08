import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../core/cli.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const fixtureRoot = path.join(import.meta.dirname, 'strict-clean');
const FIXTURE_TIMEOUT_MS = 300_000;
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(root, ...args) {
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', ...args], {
    cwd: root,
  });
}

// A copy of the fixture project in its own repository, with the dependencies nitpicker's tools need
// linked in, so the run sees a real consumer checkout.
function createProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-strict-clean-'));
  temporaryRoots.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\nreports/\n');
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fixture');
  return root;
}

function runSnapshot(root, extraArguments = []) {
  const output = path.join(root, 'reports/snapshot');
  let stdoutText = '';
  let stderrText = '';
  const exitCode = runCli({
    arguments_: ['--all', '--output', output, ...extraArguments],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: { write: (text) => (stdoutText += text) },
    stderr: { write: (text) => (stderrText += text) },
  });
  const summary = JSON.parse(readFileSync(path.join(output, 'summary.json'), 'utf8'));
  return { exitCode, stdoutText, stderrText, summary };
}

describe('the strict-clean fixture project', () => {
  it(
    'passes `nitpicker --all` with no enforceable findings',
    () => {
      const { exitCode, stdoutText, stderrText, summary } = runSnapshot(createProject());

      expect(stderrText).toBe('');
      expect(stdoutText).toContain('Enforceable findings: 0');
      expect(summary.overallStatus).toBe('clean');
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
      expect(stdoutText).toContain('no-restricted-syntax');
      expect(stdoutText).toContain('Do not assert with `as`');
    },
    FIXTURE_TIMEOUT_MS,
  );
});

describe('strict rules in touched code', () => {
  const legacy = [
    'export const first = 1;',
    "export const widened = ['a'] as readonly string[];",
    'export const last = 3;',
    '',
  ].join('\n');

  function createProjectWithLegacyViolation() {
    const root = createProject();
    const target = path.join(root, 'src/main/legacy.ts');
    writeFileSync(target, legacy);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'legacy violation');
    git(root, 'switch', '-q', '-c', 'feature');
    return { root, target };
  }

  function runDifference(root) {
    let stdoutText = '';
    const exitCode = runCli({
      arguments_: ['--base', 'main', '--analyzer', 'eslint-lint', '--output', 'reports/diff'],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: (text) => (stdoutText += text) },
      stderr: { write: () => undefined },
    });
    const summary = JSON.parse(readFileSync(path.join(root, 'reports/diff/summary.json'), 'utf8'));
    return { exitCode, stdoutText, summary };
  }

  it(
    'keeps a legacy violation baselined when the edit is elsewhere in the file',
    () => {
      const { root, target } = createProjectWithLegacyViolation();
      writeFileSync(target, legacy.replace('first = 1', 'first = 2'));

      const { exitCode, summary } = runDifference(root);

      expect(summary.newEnforceableFindings).toBe(0);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'fails when the edit touches the line of a legacy violation',
    () => {
      const { root, target } = createProjectWithLegacyViolation();
      writeFileSync(target, legacy.replace('] as', ']  as'));

      const { exitCode, stdoutText } = runDifference(root);

      expect(stdoutText).toContain('Do not assert with `as`');
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );
});
