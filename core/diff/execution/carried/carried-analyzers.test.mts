import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { checkpointed } from '../graph/checkpoints.mts';
import { task as analyzerTask } from '../test-support/analyzer-task.mts';
import { runAnalyzers } from '../run-analyzers.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../../shared/values/readers.mts';

type Scheduled = {
  readonly reports?: unknown[];
  readonly errors?: unknown[];
  readonly skipped?: unknown[];
};

function finding(tool: string, rule: string) {
  return { tool, rule, path: 'src/a.ts', identity: rule, message: rule, classification: 'x' };
}

function analyzer(name: string, overrides: object = {}) {
  return {
    name,
    version: '1',
    configurationHash: 'h',
    exclusions: [],
    createInvocation: (context: unknown) => ({
      command: 'node',
      args: listOf(fieldOf(context, 'carried')).map((carried) => textOf(carried)),
    }),
    ...overrides,
  };
}

function carrier() {
  return analyzer('lint', { carries: true });
}

function run(analyzers: unknown[], scheduled: Scheduled) {
  const tasks: unknown[] = [];
  const result = runAnalyzers({
    analyzers,
    projectRoot: '/project',
    policyRoot: '/project',
    toolRoot: '/tool',
    snapshot: 'head',
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    liveProjectRoot: '/project',
    headPolicyFile: undefined,
    mutationScope: undefined,
    logRoot: undefined,
    runTasks: (prepared: readonly unknown[]) => {
      tasks.push(...prepared);
      return { reports: [], errors: [], skipped: [], timings: [], ...scheduled };
    },
  });
  return { result, tasks };
}

function described(tasks: readonly unknown[]) {
  return tasks.map((task) => ({
    name: fieldOf(task, 'name'),
    reportedTools: fieldOf(task, 'reportedTools'),
    args: fieldOf(fieldOf(task, 'invocation'), 'args'),
  }));
}

describe('analyzers carried by another analyzer', () => {
  it('runs only the carrier and gives each carried analyzer its findings', () => {
    const errors = analyzer('errors', { carriedBy: 'lint' });
    const logging = analyzer('logging', { carriedBy: 'lint' });
    const lint = carrier();
    const report = { findings: [finding('lint', 'a'), finding('errors', 'b')] };

    const { result, tasks } = run([lint, errors, logging], { reports: [['lint', report]] });

    expect(described(tasks)).toEqual([
      { name: 'lint', reportedTools: ['errors', 'logging'], args: ['errors', 'logging'] },
    ]);
    expect(Object.fromEntries(result.reports)).toEqual({
      lint: { findings: [finding('lint', 'a')] },
      errors: { findings: [finding('errors', 'b')] },
      logging: { findings: [] },
    });
    expect([result.timings.get('errors'), result.metadata.has(errors)]).toEqual([0, true]);
  });

  it('runs a carried analyzer by itself when its carrier is not in the run', () => {
    const errors = analyzer('errors', { carriedBy: 'lint' });

    const { tasks } = run([errors, analyzer('other')], {});

    expect(described(tasks).map(({ name, args }) => [name, args])).toEqual([
      ['errors', []],
      ['other', []],
    ]);
  });

  it('fails or skips the carried analyzers with their carrier', () => {
    const analyzers = [carrier(), analyzer('errors', { carriedBy: 'lint' })];

    const failed = run(analyzers, { errors: [{ name: 'lint', message: 'crashed' }] }).result;
    const skipped = run(analyzers, { skipped: [{ name: 'lint', because: 'coverage' }] }).result;

    expect(failed.toolErrors.map(({ tool, message }) => [tool, message])).toEqual([
      ['lint', 'crashed'],
      ['errors', 'lint runs the errors rules, and it failed: crashed'],
    ]);
    expect([...failed.reports.keys(), ...skipped.skipped]).toEqual([
      ['lint', 'coverage'],
      ['errors', 'coverage'],
    ]);
  });

  it('keeps the error of a carried analyzer that could not be prepared', () => {
    const broken = analyzer('errors', {
      carriedBy: 'lint',
      resolveVersion: () => {
        throw new Error('no version');
      },
    });
    const report = { findings: [finding('errors', 'b')] };

    const { result } = run([carrier(), broken], { reports: [['lint', report]] });

    expect(result.toolErrors.map(({ tool, message }) => [tool, message])).toEqual([
      ['errors', 'no version'],
    ]);
    expect([...result.reports.keys()]).toEqual(['lint']);
  });
});

describe('the checkpoint of a carrier', () => {
  it('is written once per analyzer, each with its own findings', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-carried-'));
    onTestFinished(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const file = (name: string) => path.join(root, `${name}.json`);
    const task = {
      ...analyzerTask('lint'),
      checkpoint: { key: 'lint-key', file: file('lint') },
      carried: [
        { name: 'errors', checkpoint: { key: 'errors-key', file: file('errors') } },
        { name: 'logging' },
      ],
    };
    const report = { findings: [finding('lint', 'a'), finding('errors', 'b')] };

    checkpointed(task, { name: 'lint', report }, []);

    const written = (name: string): unknown => parseJson(readFileSync(file(name), 'utf8'));
    expect(listOf(fieldOf(written('lint'), 'findings'))).toEqual([finding('lint', 'a')]);
    expect(listOf(fieldOf(written('errors'), 'findings'))).toEqual([finding('errors', 'b')]);
    expect(existsSync(file('logging'))).toBe(false);
  });
});
