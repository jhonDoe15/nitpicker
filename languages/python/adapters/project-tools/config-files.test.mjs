import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pythonConfigFiles } from './config-files.mjs';

let root;

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the Python config files that key the findings cache', () => {
  it('include the pytest config, whose retry values the test run reads', () => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-config-'));
    for (const name of ['pytest.ini', 'tox.ini', 'unrelated.ini']) {
      writeFileSync(path.join(root, name), '[pytest]\nreruns = 2\n');
    }

    expect(pythonConfigFiles(root).map((file) => path.basename(file))).toEqual([
      'pytest.ini',
      'tox.ini',
    ]);
  });
});
