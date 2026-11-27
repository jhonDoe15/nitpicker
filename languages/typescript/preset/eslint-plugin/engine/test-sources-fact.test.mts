import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { testSourcesFact } from './test-sources-fact.mts';

const top = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-test-sources-fact-')));
const FILES: Readonly<Record<string, string>> = {
  'repository/.git/HEAD': 'ref: refs/heads/main\n',
  'repository/package.json': '{}',
  'repository/app/src/a.ts': 'export const a = 1;\n',
  'repository/app/src/a.test.ts': 'export {};\n',
  'repository/app/README.md': '# app\n',
  'loose/src/b.ts': 'export const b = 1;\n',
};
for (const [file, text] of Object.entries(FILES)) {
  mkdirSync(path.dirname(path.join(top, file)), { recursive: true });
  writeFileSync(path.join(top, file), text);
}

afterAll(() => {
  rmSync(top, { recursive: true, force: true });
});

function listing(root: string): string[] {
  const fact = testSourcesFact(root);
  return readFileSync(String(fact['test-sources']), 'utf8').trimEnd().split('\n');
}

describe('the test sources fact', () => {
  it('lists the code files of the whole repository and marks the test sources', () => {
    const [directory, ...files] = listing(path.join(top, 'repository', 'app'));

    expect(directory).toBe(process.cwd().replaceAll('\\', '/'));
    expect(files.toSorted()).toEqual(
      [
        `0\t${path.join(top, 'repository', 'app', 'src', 'a.ts')}`,
        `1\t${path.join(top, 'repository', 'app', 'src', 'a.test.ts')}`,
      ].toSorted(),
    );
  });

  it('lists the project folder itself when it is not in a repository', () => {
    const [, ...files] = listing(path.join(top, 'loose'));
    expect(files).toEqual([`0\t${path.join(top, 'loose', 'src', 'b.ts')}`]);
  });

  it('writes each listing once', () => {
    const root = path.join(top, 'loose');
    expect(testSourcesFact(root)).toEqual(testSourcesFact(root));
  });
});
