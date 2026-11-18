import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runTaskGraph } from './task-graph.mts';
import { scriptAnalyzer as analyzer } from '../test-support/analyzer-task.mts';
import { SCHEDULER_TOOL, runAnalyzers } from '../run-analyzers.mts';
import type { Checkpoints } from '../tasks.mts';
import { createFindingsCache } from '../../cache/findings-cache.mts';
import { runBaseWithCache } from '../../cache/entries/run-with-cache.mts';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';
import { fieldOf, parseJson } from '../../../../shared/values/readers.mts';

const fixtures = useGitFixtures();

const FINDING = {
  tool: 'fast',
  rule: 'r',
  path: 'a.ts',
  identity: 'i',
  message: 'm',
  classification: 'enforceable',
};

function killingTheSchedulerOnceSaved(directory: string): string {
  return [
    "const { existsSync, readdirSync } = require('node:fs');",
    `const saved = () => existsSync(${JSON.stringify(directory)}) &&`,
    `  readdirSync(${JSON.stringify(directory)}).some((file) => file.endsWith('.json'));`,
    "setInterval(() => saved() && process.kill(process.ppid, 'SIGKILL'), 20);",
  ].join('\n');
}

function printing(report: object): string {
  return `process.stdout.write(${JSON.stringify(JSON.stringify(report))});`;
}

function task(name: string, file: string, dependencies: string[] = []) {
  return {
    name,
    dependencies,
    concurrencyWeight: 1,
    timeoutMs: 60_000,
    acceptedExitCodes: [0],
    invocation: { command: 'node', args: [] },
    checkpoint: { key: `${name}-key`, file },
  };
}

function cachedRun(root: string, run: (analyzers: readonly unknown[]) => void) {
  const cache = createFindingsCache({
    store: undefined,
    directory: path.join(root, 'cache'),
    mergeBaseSha: 'abc',
    projectRelativePath: '.',
  });
  return runBaseWithCache({
    cache,
    analyzers: [
      analyzer('fast', printing({ findings: [FINDING] })),
      analyzer('slow', killingTheSchedulerOnceSaved(path.join(root, 'cache'))),
    ],
    resolveContext: { liveProjectRoot: root, policyRoot: root },
    run: (analyzers: readonly unknown[], checkpoints: Checkpoints) => {
      run(analyzers);
      return runAnalyzers({
        analyzers,
        projectRoot: root,
        policyRoot: root,
        toolRoot: root,
        snapshot: 'base',
        baselineRoot: undefined,
        baselineMovesFile: undefined,
        liveProjectRoot: root,
        headPolicyFile: undefined,
        mutationScope: undefined,
        logRoot: undefined,
        runTasks: undefined,
        checkpoints,
      });
    },
  });
}

describe('analyzer checkpoints', () => {
  it('save a clean report as soon as its analyzer finishes, in the cache entry format', async () => {
    const root = fixtures.temporaryRoot('nitpicker-checkpoints-');
    const saved = path.join(root, 'cache', 'fast-key.json');
    const failed = path.join(root, 'cache', 'failed-key.json');
    const after = path.join(root, 'cache', 'after-key.json');

    await runTaskGraph(
      [task('fast', saved), task('failed', failed), task('after', after, ['failed'])],
      {
        maxParallel: 1,
        onSettled: undefined,
        execute: (scheduled: unknown) =>
          fieldOf(scheduled, 'name') === 'failed'
            ? { findings: [{ ...FINDING, classification: 'tool-error' }] }
            : { findings: [FINDING] },
      },
    );

    expect(parseJson(readFileSync(saved, 'utf8'))).toEqual({
      key: 'fast-key',
      findings: [FINDING],
    });
    expect(existsSync(failed)).toBe(false);
    expect(existsSync(after)).toBe(false);
  });

  it('keep the finished analyzers when the scheduler dies, and a rerun runs only the rest', () => {
    const root = fixtures.temporaryRoot('nitpicker-checkpoints-');
    const ran: string[][] = [];
    const record = (analyzers: readonly unknown[]): void => {
      ran.push(analyzers.map((entry) => String(fieldOf(entry, 'name'))));
    };

    const crashed = cachedRun(root, record);
    cachedRun(root, record);

    expect(crashed.reports.get('fast')?.findings).toEqual([FINDING]);
    expect(crashed.reports.has('slow')).toBe(false);
    expect(crashed.toolErrors.map((error) => error.tool)).toEqual([SCHEDULER_TOOL]);
    expect(ran).toEqual([['fast', 'slow'], ['slow']]);
  });
});
