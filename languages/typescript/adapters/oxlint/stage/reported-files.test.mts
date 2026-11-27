import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { reportedFiles } from './reported-files.mts';

const top = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-reported-files-')));
const stage = path.join(top, 'stage');
const outside = path.join(top, 'project', 'shared.ts');
mkdirSync(path.join(stage, 'src'), { recursive: true });
mkdirSync(path.dirname(outside));
writeFileSync(outside, 'export const shared = 1;\n');
writeFileSync(path.join(stage, 'src', 'own.ts'), 'export const own = 1;\n');
symlinkSync(outside, path.join(stage, 'src', 'first.ts'));
symlinkSync(outside, path.join(stage, 'src', 'second.ts'));

afterAll(() => {
  rmSync(top, { recursive: true, force: true });
});

describe('files oxlint reported on the stage', () => {
  const files = reportedFiles(stage, [
    'src/own.ts',
    'src/first.ts',
    'src/second.ts',
    'src/gone.ts',
  ]);

  it('keeps a file inside the stage as it is', () => {
    expect(files('src/own.ts')).toEqual([
      { filePath: 'src/own.ts', full: path.join(stage, 'src', 'own.ts') },
    ]);
  });

  it('maps a file oxlint followed out of the stage back to every listed link to it', () => {
    expect(files(outside)).toEqual([
      { filePath: 'src/first.ts', full: path.join(stage, 'src', 'first.ts') },
      { filePath: 'src/second.ts', full: path.join(stage, 'src', 'second.ts') },
    ]);
  });

  it('drops a file outside the stage that no listed file links to', () => {
    expect(files(path.join(top, 'project', 'other.ts'))).toEqual([]);
  });
});
