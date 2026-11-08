import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAnalyzers } from '../execution/run-analyzers.mjs';
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

    expect(invocationContext(logRoot)).toMatchObject({
      logRoot,
      logLabel: 'reports/quality/diff/logs',
    });
  });

  it('names a log folder outside the live project by its full path, and none when there is none', () => {
    const logRoot = path.join(path.sep, 'tmp', 'out', 'logs');

    expect(invocationContext(logRoot)).toMatchObject({ logRoot, logLabel: logRoot });
    expect(invocationContext(undefined)).not.toHaveProperty('logRoot');
  });
});
