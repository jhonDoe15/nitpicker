import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { spawnedEntryFiles } from './spawned-entries.mjs';

const { gitCheckout } = useGitCheckouts();

const root = mkdtempSync(path.join(tmpdir(), 'spawned-entries-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('spawnedEntryFiles', () => {
  it('resolves literal worker paths from path.join and new URL', () => {
    mkdirSync(path.join(root, 'src/sub'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules/dep'), { recursive: true });
    writeFileSync(path.join(root, 'src/worker.mjs'), '');
    writeFileSync(path.join(root, 'src/sub/other.mjs'), '');
    writeFileSync(
      path.join(root, 'src/main.mjs'),
      [
        "const a = path.join(import.meta.dirname, 'worker.mjs');",
        "const b = new URL('./sub/other.mjs', import.meta.url);",
        "const c = path.join(import.meta.dirname, 'missing.mjs');",
        "const d = path.join(import.meta.dirname, 'data.json');",
      ].join('\n'),
    );
    writeFileSync(path.join(root, 'node_modules/dep/x.mjs'), "new URL('./w.mjs', import.meta.url)");
    expect(spawnedEntryFiles(root)).toEqual(['src/sub/other.mjs', 'src/worker.mjs']);
  });

  it('skips build output at the project root only', () => {
    const project = path.join(root, 'output');
    mkdirSync(path.join(project, 'dist'), { recursive: true });
    mkdirSync(path.join(project, 'src/reports'), { recursive: true });
    writeFileSync(path.join(project, 'dist/worker.mjs'), '');
    writeFileSync(path.join(project, 'src/reports/worker.mjs'), '');
    writeFileSync(path.join(project, 'dist/main.mjs'), "new URL('./worker.mjs', import.meta.url)");
    writeFileSync(
      path.join(project, 'src/reports/main.mjs'),
      "new URL('./worker.mjs', import.meta.url)",
    );
    expect(spawnedEntryFiles(project)).toEqual(['src/reports/worker.mjs']);
  });

  it('reads ignored generated folders of a Git checkout, but not nested checkouts or installed packages', () => {
    const spawn = "new URL('./worker.mjs', import.meta.url)";
    const project = gitCheckout(
      {
        'src/worker.mjs': '',
        'src/main.mjs': spawn,
        'scratch/worker.mjs': '',
        'scratch/main.mjs': spawn,
        'node_modules/dep/worker.mjs': '',
        'node_modules/dep/main.mjs': spawn,
        ...nestedCheckout('agent', { 'worker.mjs': '', 'main.mjs': spawn }),
      },
      ['scratch/', 'node_modules/'],
    );

    expect(spawnedEntryFiles(project)).toEqual(['scratch/worker.mjs', 'src/worker.mjs']);
  });
});
