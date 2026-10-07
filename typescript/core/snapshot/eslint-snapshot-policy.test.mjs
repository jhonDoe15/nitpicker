import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEslintSnapshotAnalyzer } from '../../adapters/snapshot/eslint.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const runnerPath = path.join(projectRoot, 'adapters/snapshot/eslint-snapshot-runner.mjs');
const fixtureConfig = 'core/snapshot/fixtures/eslint-fixture-config.mjs';
const fixtureSource = 'core/snapshot/fixtures/eslint-fixture-source.ts';

describe('ESLint snapshot adapter', () => {
  it('builds an invocation that points at the snapshot runner with the given policy', () => {
    const analyzer = createEslintSnapshotAnalyzer({
      name: 'fixture-eslint',
      version: '1.0.0',
      configurationHash: 'fixture',
      exclusions: [],
      configRelativePath: fixtureConfig,
      patterns: [fixtureSource],
    });

    const invocation = analyzer.createInvocation({ toolRoot: projectRoot });

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.cwd).toBe(projectRoot);
    expect(invocation.args).toEqual([
      runnerPath,
      '--analyzer-name',
      'fixture-eslint',
      '--project-root',
      projectRoot,
      '--config',
      fixtureConfig,
      '--pattern',
      fixtureSource,
    ]);
  });

  it('finds a real finding in the fixture source without any worktree or dependency linking', () => {
    const result = runFixtureRunner({ pattern: fixtureSource });

    expect(result.status).toBe(0);
    const { findings } = JSON.parse(result.stdout);
    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'fixture-eslint',
        rule: 'no-debugger',
        path: fixtureSource,
        classification: 'enforceable',
      }),
    ]);
  });

  it('rejects a project root other than the trusted checkout', () => {
    const result = runFixtureRunner({ projectRoot: '/tmp', pattern: fixtureSource });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--project-root must be the project checkout');
  });

  it('rejects a config path that escapes the project root', () => {
    const result = runFixtureRunner({ config: '../outside.mjs', pattern: fixtureSource });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--config must stay within the project root');
  });

  it('rejects a pattern that escapes the project root', () => {
    const result = runFixtureRunner({ pattern: '../../outside.ts' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--pattern must stay within the project root');
  });
});

function runFixtureRunner({
  projectRoot: projectRootArgument = projectRoot,
  config = fixtureConfig,
  pattern,
} = {}) {
  const args = [
    runnerPath,
    '--analyzer-name',
    'fixture-eslint',
    '--project-root',
    projectRootArgument,
    '--config',
    config,
    '--pattern',
    pattern,
  ];
  return spawnSync(process.execPath, args, { cwd: projectRoot, encoding: 'utf8' });
}
