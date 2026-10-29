import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { writeFiles } from '../fixture-files.mjs';
import { fixtureGit } from '../git-repository.mjs';

const LONG_AGO = new Date('2020-01-01T00:00:00Z');

export function relativeTo(root, files) {
  return files.map((file) => path.relative(root, file).split(path.sep).join('/')).toSorted();
}

export function ageTree(root) {
  for (const entry of readdirSync(root, { recursive: true })) {
    const full = pathInside(root, entry);
    if (full !== undefined) {
      utimesSync(full, LONG_AGO, LONG_AGO);
    }
  }
  utimesSync(root, LONG_AGO, LONG_AGO);
}

export function useProjectFixtures() {
  const roots = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function temporaryRoot() {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-files-'));
    roots.push(root);
    return root;
  }

  function outsideGit(files) {
    const base = temporaryRoot();
    writeFileSync(path.join(base, '.git'), 'gitdir: /nonexistent\n');
    const root = path.join(base, 'project');
    mkdirSync(root);
    writeFiles(root, files);
    return root;
  }

  function gitProject(files, { ignored = [], tracked = [] } = {}) {
    const root = temporaryRoot();
    fixtureGit(root, ['init', '-q']);
    writeFiles(root, files);
    writeFileSync(path.join(root, '.git', 'info', 'exclude'), `${ignored.join('\n')}\n`);
    if (tracked.length > 0) {
      fixtureGit(root, ['add', '-f', ...tracked]);
    }
    return root;
  }

  function tracedGit(traceFile) {
    vi.stubEnv('GIT_TRACE', traceFile);
  }

  return { temporaryRoot, outsideGit, gitProject, tracedGit };
}
