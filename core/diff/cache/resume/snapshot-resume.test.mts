import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resumedAnalyzerRun } from './snapshot-resume.mts';
import { scriptAnalyzer as analyzer } from '../../execution/test-support/analyzer-task.mts';
import { createDirectoryStore } from '../cache-stores.mts';
import { createResumeCache } from './resume-cache.mts';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';

const fixtures = useGitFixtures();
const FINDING = {
  tool: 'fast',
  rule: 'r',
  path: 'a.ts',
  identity: 'i',
  message: 'm',
  classification: 'enforceable',
};

function stoppingOnce(resumeRoot: string, stopped: string): string {
  return [
    "const { existsSync, readdirSync, writeFileSync } = require('node:fs');",
    `if (existsSync(${JSON.stringify(stopped)})) { process.stdout.write('{"findings":[]}'); }`,
    'else setInterval(() => {',
    `  const saved = existsSync(${JSON.stringify(resumeRoot)}) &&`,
    `    readdirSync(${JSON.stringify(resumeRoot)}, { recursive: true }).some((file) => String(file).endsWith('.json'));`,
    `  if (saved) { writeFileSync(${JSON.stringify(stopped)}, ''); process.kill(process.ppid, 'SIGKILL'); }`,
    '}, 20);',
  ].join('\n');
}

function snapshotRun(root: string, lines: string[]) {
  const cacheDirectory = path.join(root, 'cache');
  const analyzers = [
    analyzer(
      'fast',
      `process.stdout.write(${JSON.stringify(JSON.stringify({ findings: [FINDING] }))});`,
    ),
    analyzer(
      'stopping',
      stoppingOnce(path.join(cacheDirectory, 'resume'), path.join(root, 'stopped')),
    ),
  ];
  const resume = createResumeCache({
    cacheStore: { ...createDirectoryStore(cacheDirectory), directory: cacheDirectory },
    kind: 'snapshot',
    projectRelativePath: '.',
    treeKey: 'snapshot-tree:1',
    analyzers,
    configOverrides: [],
    headPolicy: {},
  });
  return resumedAnalyzerRun(
    resume === undefined ? undefined : { ...resume, report: (line: string) => lines.push(line) },
    {
      analyzers,
      projectRoot: root,
      policyRoot: root,
      toolRoot: root,
      snapshot: 'head',
      baselineRoot: undefined,
      baselineMovesFile: undefined,
      liveProjectRoot: root,
      headPolicyFile: undefined,
      mutationScope: undefined,
      logRoot: undefined,
      runTasks: undefined,
    },
  );
}

describe('an --all run after an unfinished one', () => {
  it('reports what finished, then resumes it and runs only the rest', () => {
    const root = fixtures.temporaryRoot('nitpicker-snapshot-resume-');
    const lines: string[] = [];

    const stopped = snapshotRun(root, lines);
    const resumed = snapshotRun(root, lines);

    expect(stopped.reports.get('fast')?.findings).toEqual([FINDING]);
    expect(stopped.toolErrors.map((error) => error.tool)).toEqual(['analyzer-scheduler']);
    expect(lines).toEqual([
      expect.stringMatching(/^nitpicker: head: 1 analyzer resumed from an unfinished run \(/u),
    ]);
    expect(resumed.reports.get('fast')?.findings).toEqual([FINDING]);
    expect(resumed.reports.get('stopping')?.findings).toEqual([]);
    expect(resumed.toolErrors).toEqual([]);
    expect(existsSync(path.join(root, 'cache', 'resume'))).toBe(true);
    expect(readdirSync(path.join(root, 'cache', 'resume'))).toHaveLength(1);
  });
});
