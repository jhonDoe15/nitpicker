import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDiagnostics, readPatches } from './patch-files.mjs';

const roots = [];

function workspace() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-patch-files-')));
  roots.push(root);
  const project = path.join(root, 'project');
  const work = path.join(root, 'work');
  mkdirSync(path.join(project, 'src'), { recursive: true });
  mkdirSync(path.join(work, 'patches', 'a1'), { recursive: true });
  mkdirSync(path.join(work, 'patches', 'b2-lombok'), { recursive: true });
  mkdirSync(path.join(work, 'reports', 'm'), { recursive: true });
  return { root, project, work };
}

const BODY = '@@ -1 +1 @@\n-x\n+y\n';

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('readPatches', () => {
  it('resolves relative paths against the folder of the patch and merges patches per file', () => {
    const { project, work } = workspace();
    writeFileSync(
      path.join(work, 'patches/a1/error-prone.patch'),
      `--- ../../../project/src/A.java\n+++ ../../../project/src/A.java\n${BODY}`,
    );
    writeFileSync(
      path.join(work, 'patches/b2-lombok/error-prone.patch'),
      `--- ${path.join(project, 'src/A.java')}\n+++ ${path.join(project, 'src/A.java')}\n${BODY}` +
        `--- ${path.join(project, 'src/B.java')}\n+++ ${path.join(project, 'src/B.java')}\n${BODY}`,
    );

    const hunks = readPatches({ patchRoot: path.join(work, 'patches'), projectRoot: project });

    expect([...hunks.keys()].toSorted((left, right) => left.localeCompare(right))).toEqual([
      'src/A.java',
      'src/B.java',
    ]);
    expect(hunks.get('src/A.java')).toHaveLength(2);
  });

  it('skips files outside the project, created files and deleted files', () => {
    const { root, project, work } = workspace();
    writeFileSync(
      path.join(work, 'patches/a1/error-prone.patch'),
      `--- ${path.join(root, 'elsewhere/E.java')}\n+++ ${path.join(root, 'elsewhere/E.java')}\n${BODY}` +
        `--- /dev/null\n+++ ${path.join(project, 'N.java')}\n${BODY}` +
        `--- ${path.join(project, 'D.java')}\n+++ /dev/null\n${BODY}`,
    );

    expect(readPatches({ patchRoot: path.join(work, 'patches'), projectRoot: project }).size).toBe(
      0,
    );
  });

  it('returns nothing when no patch was written', () => {
    const { project, work } = workspace();

    expect(readPatches({ patchRoot: path.join(work, 'nothing'), projectRoot: project }).size).toBe(
      0,
    );
  });
});

describe('readDiagnostics', () => {
  it('reads the check and the line of each diagnostic, by project path', () => {
    const { project, work } = workspace();
    writeFileSync(
      path.join(work, 'reports/m/errorprone.json'),
      JSON.stringify([
        {
          file: path.join(project, 'src/A.java'),
          line: 4,
          message: '[MissingOverride] run overrides',
        },
        { file: path.join(project, 'src/A.java'), line: 9, message: 'no check name' },
      ]),
    );

    expect(
      readDiagnostics({ reportRoot: path.join(work, 'reports'), projectRoot: project }),
    ).toEqual(new Map([['src/A.java', [{ check: 'MissingOverride', line: 4 }]]]));
  });
});
