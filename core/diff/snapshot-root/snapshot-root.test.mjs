import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAnalyzers } from '../execution/run-analyzers.mjs';
import { clearDiffReports } from '../reporting/reporters.mjs';
import { withoutSnapshotRoot } from './snapshot-root.mjs';

const WORKTREE = path.join(path.sep, 'tmp', 'nitpicker-diff-Ab.c1', 'head');
const SOURCE = path.join(WORKTREE, 'services', 'Handler.java');
const LIVE = path.join(path.sep, 'work', 'shop');

const analyzer = {
  name: 'java',
  version: '1',
  configurationHash: 'hash',
  exclusions: [],
  createInvocation: () => ({ command: 'java', args: [] }),
};

function runWith(projectRoot, schedule) {
  return runAnalyzers({
    analyzers: [analyzer],
    projectRoot,
    policyRoot: projectRoot,
    toolRoot: projectRoot,
    liveProjectRoot: LIVE,
    snapshot: 'head',
    runTasks: schedule,
  });
}

const failing = () => ({
  reports: [
    [
      'java',
      {
        findings: [
          { classification: 'tool-error', message: `missing ${SOURCE}` },
          { classification: 'enforceable', message: `kept ${SOURCE}` },
        ],
      },
    ],
  ],
  errors: [{ name: 'java', message: `Java preset failed in ${WORKTREE}: ${SOURCE}:44: error` }],
  timings: [],
});

describe('withoutSnapshotRoot', () => {
  const snapshotRoot = { projectRoot: WORKTREE, snapshot: 'head' };

  it('makes paths under the snapshot project-relative and names the root itself by its snapshot', () => {
    expect(withoutSnapshotRoot(`failed in ${WORKTREE}: ${SOURCE}:44`, snapshotRoot)).toBe(
      `failed in head: ${path.join('services', 'Handler.java')}:44`,
    );
  });

  it('also replaces the forward-slash spelling and a root that ends a sentence', () => {
    const slashed = WORKTREE.split(path.sep).join('/');

    expect(withoutSnapshotRoot(`${slashed}/A.java in ${WORKTREE}.`, snapshotRoot)).toBe(
      'A.java in head.',
    );
  });

  it('leaves a longer sibling path alone', () => {
    const sibling = `${WORKTREE}-old${path.sep}A.java ${WORKTREE}.bak`;

    expect(withoutSnapshotRoot(sibling, snapshotRoot)).toBe(sibling);
  });
});

describe('runAnalyzers tool errors', () => {
  it('never names the temporary snapshot directory', () => {
    const run = runWith(WORKTREE, failing);

    expect(run.toolErrors.map(({ message }) => message)).toEqual([
      `Java preset failed in head: ${path.join('services', 'Handler.java')}:44: error`,
    ]);
    expect(run.reports.get('java').findings.map(({ message }) => message)).toEqual([
      `missing ${path.join('services', 'Handler.java')}`,
      `kept ${SOURCE}`,
    ]);
  });

  it('keeps the paths of a run on the live project', () => {
    const run = runWith(LIVE, () => ({
      reports: [],
      errors: [{ name: 'java', message: `failed in ${LIVE}` }],
      timings: [],
    }));

    expect(run.toolErrors.map(({ message }) => message)).toEqual([`failed in ${LIVE}`]);
  });
});

describe('runAnalyzers log folder', () => {
  function invocationContext(logRoot) {
    const seen = [];
    runAnalyzers({
      analyzers: [
        {
          ...analyzer,
          createInvocation: (context) => {
            seen.push(context);
            return analyzer.createInvocation();
          },
        },
      ],
      projectRoot: WORKTREE,
      policyRoot: WORKTREE,
      toolRoot: WORKTREE,
      liveProjectRoot: LIVE,
      snapshot: 'head',
      logRoot,
      runTasks: () => ({ reports: [], errors: [], timings: [] }),
    });
    return seen[0];
  }

  it('names a log folder inside the live project by its relative path', () => {
    const logRoot = path.join(LIVE, 'reports', 'quality', 'diff', 'logs');

    const { logLabel } = invocationContext(logRoot);

    expect(logLabel).toBe('reports/quality/diff/logs');
  });

  it('names a log folder outside the live project by its full path, and none when there is none', () => {
    const logRoot = path.join(path.sep, 'tmp', 'out', 'logs');

    const outside = invocationContext(logRoot);

    expect([outside.logRoot, outside.logLabel]).toEqual([logRoot, logRoot]);
    expect('logRoot' in invocationContext(undefined)).toBe(false);
  });
});

describe('clearing the log folder', () => {
  it('removes only the build logs a run wrote, and the folder once it is empty', () => {
    const output = mkdtempSync(path.join(tmpdir(), 'nitpicker-logs-clear-'));
    const logs = path.join(output, 'logs');
    mkdirSync(logs);
    for (const name of ['java-head-gradle.log', 'kotlin-base-gradle.log', 'server.log']) {
      writeFileSync(path.join(logs, name), 'x');
    }
    try {
      clearDiffReports(output);
      expect(readdirSync(logs)).toEqual(['server.log']);
      rmSync(path.join(logs, 'server.log'));
      writeFileSync(path.join(logs, 'java-head-gradle.log'), 'x');
      clearDiffReports(output);
      expect(existsSync(logs)).toBe(false);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
