import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../../../core/cli.mjs';
import { withDefaultAnalyzerParallelism } from '../../../../core/diff/fixtures/analyzer-parallelism.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const fixtureRoot = path.join(import.meta.dirname, 'react-project');
const FIXTURE_TIMEOUT_MS = 300_000;
const testRulePattern = /^(?:testing-library\/|nitpicker\/react-test-)/;
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function commitProject({ manifest, config }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-project-'));
  temporaryRoots.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\nreports/\n');
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  if (manifest !== undefined) {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  }
  if (config !== undefined) {
    writeFileSync(path.join(root, 'nitpicker.config.json'), JSON.stringify(config));
  }
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['add', '-A'],
    ['commit', '-q', '-m', 'fixture'],
  ]) {
    execFileSync(
      'git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', ...args],
      {
        cwd: root,
      },
    );
  }
  return root;
}

function lintFindings(root) {
  const output = path.join(root, 'reports/snapshot');
  const exitCode = withDefaultAnalyzerParallelism(() =>
    runCli({
      arguments_: ['--all', '--analyzer', 'eslint-lint', '--output', output],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      progress: { write: () => undefined },
    }),
  );
  const findings = JSON.parse(readFileSync(path.join(output, 'findings.json'), 'utf8'));
  return { exitCode, findings };
}

function rulesByFile(findings, directory = 'src/') {
  const rules = {};
  for (const { rule, path: file } of findings) {
    if (file.startsWith(directory)) {
      const name = path.basename(file, '.tsx');
      rules[name] = [...new Set([...(rules[name] ?? []), rule])].toSorted();
    }
  }
  return rules;
}

function testRulesByFile(findings, directory = 'test/') {
  return rulesByFile(
    findings.filter(({ rule }) => testRulePattern.test(rule)),
    directory,
  );
}

function messageOf(findings, rule) {
  return findings.find((finding) => finding.rule === rule)?.message;
}

describe('the react-project fixture', () => {
  it(
    'flags each banned form with its rule, passes the allowed file and leaves tests without React alone',
    () => {
      const { exitCode, findings } = lintFindings(commitProject({}));

      expect(testRulesByFile(findings)).toEqual({
        'container-query.test': ['testing-library/no-node-access'],
        'destructured-query.test': ['testing-library/prefer-screen-queries'],
        'fire-event.test': ['testing-library/prefer-user-event'],
        'hook-spy.test': ['nitpicker/react-test-no-implementation-details'],
        'internals.test': ['nitpicker/react-test-no-implementation-details'],
        'test-id.test': ['testing-library/no-test-id-queries'],
        'unawaited-event.test': ['testing-library/await-async-events'],
        'wrapper-container.test': ['testing-library/no-node-access'],
      });
      expect(testRulesByFile(findings, '__tests__/')).toEqual({
        'root-fire-event.test': ['testing-library/prefer-user-event'],
      });
      expect(testRulesByFile(findings, 'e2e/')).toEqual({
        'root-test-id.test': ['testing-library/no-test-id-queries'],
      });
      expect(rulesByFile(findings)).toEqual({
        'class-component': ['react-x/no-class-component'],
        'conditional-hook': ['react-hooks/rules-of-hooks'],
        'derived-state': ['nitpicker/react-no-effect-derived-state'],
        'effect-fetch': ['nitpicker/react-no-effect-data-fetching'],
        inaccessible: [
          'jsx-a11y/alt-text',
          'jsx-a11y/click-events-have-key-events',
          'jsx-a11y/no-noninteractive-element-interactions',
        ],
        'index-key': ['react-x/no-array-index-key'],
        'inline-style': ['nitpicker/react-single-styling-approach'],
        'missing-dependency': ['react-hooks/exhaustive-deps'],
      });
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'applies no React rule to a project that does not depend on react, whatever the exceptions say',
    () => {
      const { findings } = lintFindings(
        commitProject({
          manifest: { private: true },
          config: {
            exceptions: [
              { rule: 'react-hooks/exhaustive-deps', paths: ['src/**'], reason: 'Legacy hooks' },
            ],
          },
        }),
      );

      expect(rulesByFile(findings)).toEqual({
        allowed: ['@typescript-eslint/no-misused-promises', 'no-restricted-syntax'],
        'class-component': ['no-restricted-syntax'],
      });
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'names the configured styling approach',
    () => {
      const { findings } = lintFindings(
        commitProject({ config: { react: { styling: 'css-in-js' } } }),
      );

      expect(messageOf(findings, 'nitpicker/react-single-styling-approach')).toContain(
        'Style with styled components',
      );
    },
    FIXTURE_TIMEOUT_MS,
  );
});
