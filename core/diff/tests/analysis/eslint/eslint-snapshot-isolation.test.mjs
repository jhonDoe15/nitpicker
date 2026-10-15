import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArguments } from '../../../../../languages/typescript/adapters/eslint/arguments.mjs';
import {
  toolRoot,
  fakeEslintCliPath,
  temporaryRepositories,
  registerEslintRepositoryLifecycle,
  createRepository,
  comparisonOptions,
  fixtureAnalyzer,
  policyFiles,
  sourceWithDebugger,
  writeFiles,
  commit,
} from './eslint-fixtures.mjs';

const eslintRunnerPath = path.join(toolRoot, 'languages/typescript/adapters/eslint-runner.mjs');
import { runQualityDiff } from '../../../comparison/run-diff.mjs';

registerEslintRepositoryLifecycle();

const fixtureDependencyLockfile = `${JSON.stringify(
  {
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'fixture',
        version: '1.0.0',
        dependencies: { 'fixture-dependency': 'file:vendor/fixture-dependency' },
      },
      'node_modules/fixture-dependency': { resolved: 'vendor/fixture-dependency', link: true },
      'vendor/fixture-dependency': { version: '1.0.0' },
    },
  },
  null,
  2,
)}\n`;

function dependencyAnalyzer() {
  return {
    name: 'dependency-analyzer',
    version: 'fixture',
    configurationHash: 'fixture',
    exclusions: [],
    requiresDependencies: true,
    createInvocation({ toolRoot }) {
      return {
        command: process.execPath,
        args: ['-e', 'process.stdout.write(JSON.stringify({ findings: [] }))'],
        cwd: toolRoot,
      };
    },
  };
}

describe('ESLint snapshot isolation and failures', () => {
  it('uses prepared baseline dependencies without replacing them with head dependencies', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
    temporaryRepositories.push(root);
    const projectRoot = path.join(root, 'base/project');
    const policyRoot = path.join(root, 'base/policy');
    writeFiles(projectRoot, {
      'package.json': '{"name":"fixture","version":"1.0.0"}\n',
      'node_modules/baseline-marker.txt': 'baseline dependencies\n',
      'src/main/source.ts': sourceWithDebugger('baseline'),
    });
    writeFiles(policyRoot, {
      ...policyFiles(),
      'package.json': '{"name":"fixture","version":"2.0.0"}\n',
    });

    const result = spawnSync(
      process.execPath,
      [
        eslintRunnerPath,
        '--analyzer-name',
        'eslint-lint',
        '--project-root',
        projectRoot,
        '--policy-root',
        policyRoot,
        '--tool-root',
        toolRoot,
        '--config',
        'eslint.config.mjs',
        '--pattern',
        'src/main/**/*.ts',
      ],
      { encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).findings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/source.ts',
        identity:
          'message:`debugger` statement is not allowed|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message: '`debugger` statement is not allowed',
        location: { line: 2, column: 3 },
        classification: 'enforceable',
        symbol: 'baseline',
        ratchet: {
          key: 'count:`debugger` statement is not allowed',
          value: 1,
          existingCodeOnly: true,
        },
      },
    ]);
    expect(existsSync(path.join(projectRoot, 'node_modules/baseline-marker.txt'))).toBe(true);
    expect(existsSync(path.join(policyRoot, 'node_modules'))).toBe(false);
  });
  it('uses dependencies prepared for a changed package manifest', () => {
    const packageJson = {
      name: 'fixture',
      version: '1.0.0',
      dependencies: { 'fixture-dependency': 'file:vendor/fixture-dependency' },
      scripts: { check: 'old' },
    };
    const repository = createRepository({
      ...policyFiles(),
      'package.json': `${JSON.stringify(packageJson)}\n`,
      'package-lock.json': fixtureDependencyLockfile,
      'vendor/fixture-dependency/package.json': '{"name":"fixture-dependency","version":"1.0.0"}\n',
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(repository.root, {
      'package.json': `${JSON.stringify({
        ...packageJson,
        scripts: { check: 'new' },
      })}\n`,
    });
    commit(repository.root, 'change package manifest');

    const report = runQualityDiff(
      comparisonOptions(repository, [
        fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
          eslintCliPath: fakeEslintCliPath,
        }),
        dependencyAnalyzer(),
      ]),
    );

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.toolErrors).toEqual([]);
  });
  it('rejects direct filesystem roots outside generated worktrees', () => {
    const untrustedRoot = mkdtempSync(path.join(tmpdir(), 'eslint-untrusted-root-'));
    temporaryRepositories.push(untrustedRoot);

    expect(() =>
      parseArguments([
        '--analyzer-name',
        'eslint-lint',
        '--project-root',
        untrustedRoot,
        '--policy-root',
        untrustedRoot,
        '--tool-root',
        toolRoot,
        '--config',
        'eslint.config.mjs',
        '--pattern',
        'src/main/**/*.ts',
      ]),
    ).toThrow(new Error('--project-root must be inside a generated quality-diff worktree'));
    expect(existsSync(path.join(untrustedRoot, 'node_modules'))).toBe(false);
  });
  it('rejects analyzer patterns that can leave the snapshot', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(repository.root, { 'head.txt': 'head\n' });
    commit(repository.root, 'create head');

    const report = runQualityDiff(
      comparisonOptions(repository, [
        fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
          patterns: ['../outside.ts'],
        }),
      ]),
    );

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toHaveLength(2);
    expect(report.toolErrors[0].message).toEqual(
      'eslint-lint crashed with exit 2: ESLint differential adapter failed: --pattern must stay within the analyzed snapshot',
    );
  });
  it.each(['malformed', 'configuration-error', 'crash', 'timeout'])(
    'reports ESLint %s as a tool error',
    (mode) => {
      const repository = createRepository({
        ...policyFiles(),
        'src/main/source.ts': 'export const source = true;\n',
      });
      writeFiles(repository.root, { 'head.txt': 'head\n' });
      commit(repository.root, 'create head');

      const report = runQualityDiff(
        comparisonOptions(repository, [
          fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
            eslintCliPath: fakeEslintCliPath,
            eslintTimeoutMs: mode === 'timeout' ? 100 : undefined,
            environment: { NITPICKER_DIFF_FAKE_ESLINT_MODE: mode },
          }),
        ]),
      );

      expect(report.summary.overallStatus).toBe('tool-error');
      expect(report.toolErrors).toHaveLength(2);
      expect(report.newFindings).toEqual([]);
    },
  );
});
