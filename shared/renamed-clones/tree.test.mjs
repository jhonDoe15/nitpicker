import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  removeTrackedTemporaryPaths,
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../core/tooling/temporary-files.mjs';
import { sourceFilesUnder } from './files.mjs';
import { withNormalizedTree } from './tree.mjs';

const roots = [];
const temporaryPaths = { track: trackTemporaryPath, untrack: untrackTemporaryPath };

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-renamed-tree-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('the normalized copy of a project', () => {
  const files = {
    'src/a.py': 'total = price * 2  # note\n',
    'src/generated.py': '# @generated\ntotal = price * 2\n',
    'src/missing-later.py': 'x = 1\n',
  };

  it('holds the normalized files at their project paths, without generated ones', () => {
    const root = project(files);
    let seen;

    withNormalizedTree(
      {
        projectRoot: root,
        files: Object.keys(files),
        syntaxOf: () => 'python',
        scratchRoot: path.join(root, 'reports'),
        temporaryPaths,
      },
      ({ tree }) => {
        seen = {
          a: readFileSync(path.join(tree, 'src/a.py'), 'utf8').replace(/\s+/gu, ''),
          generated: existsSync(path.join(tree, 'src/generated.py')),
        };
      },
    );

    expect(seen).toEqual({ a: '_=_*0', generated: false });
  });

  it('skips a listed file that is gone and removes the copy afterwards', () => {
    const root = project(files);
    let scratch;

    withNormalizedTree(
      {
        projectRoot: root,
        files: ['src/gone.py', 'src/a.py', '../outside.py'],
        syntaxOf: () => 'python',
        scratchRoot: path.join(root, 'reports'),
        temporaryPaths,
      },
      (directories) => {
        scratch = directories.scratch;
        expect(existsSync(path.join(directories.tree, 'src/a.py'))).toBe(true);
      },
    );

    expect(existsSync(scratch)).toBe(false);
  });

  it('removes the copy when the run fails', () => {
    const root = project(files);
    let scratch;

    expect(() =>
      withNormalizedTree(
        {
          projectRoot: root,
          files: [],
          syntaxOf: () => 'python',
          scratchRoot: root,
          temporaryPaths,
        },
        (directories) => {
          scratch = directories.scratch;
          throw new Error('jscpd failed');
        },
      ),
    ).toThrow('jscpd failed');
    expect(existsSync(scratch)).toBe(false);
  });

  it('keeps the copy under the report folder, where an interrupted run still removes it', () => {
    const root = project(files);
    const scratchRoot = path.join(root, 'reports/quality/duplicates');
    let seen;

    withNormalizedTree(
      {
        projectRoot: root,
        files: ['src/a.py'],
        syntaxOf: () => 'python',
        scratchRoot,
        temporaryPaths,
      },
      ({ scratch }) => {
        const inside = path.dirname(scratch) === scratchRoot;
        removeTrackedTemporaryPaths();
        seen = { inside, removedOnInterrupt: !existsSync(scratch) };
      },
    );

    expect(seen).toEqual({ inside: true, removedOnInterrupt: true });
  });
});

describe('listing the sources of a project', () => {
  it('lists the files with the extensions under the roots, sorted, without installed packages', () => {
    const root = project({
      'src/b.kt': '',
      'src/a.kt': '',
      'src/readme.md': '',
      'src/node_modules/dep/index.kt': '',
      'other/c.kt': '',
    });

    expect(sourceFilesUnder(root, ['src', 'missing'], ['.kt', '.kts'])).toEqual([
      'src/a.kt',
      'src/b.kt',
    ]);
  });
});
