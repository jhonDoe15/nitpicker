import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { startedPythonFiles } from './started-files.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-started-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('startedPythonFiles', () => {
  it('finds files and modules that a CI step or a pyproject task runs', () => {
    const root = projectWith({
      '.github/workflows/ci.yml':
        'jobs:\n  a:\n    steps:\n      - run: python3 -u scripts/check.py --fast\n      - run: uv run tools/gen.py\n      - working-directory: app\n        run: python jobs/nightly.py\n',
      'pyproject.toml':
        '[tool.poe.tasks]\nserve = "python -m shop.server"\nbuild = { cmd = "cd tools && python build.py", help = "python skipped.py" }\n',
    });

    expect(startedPythonFiles(root)).toEqual({
      files: ['tools/build.py', 'scripts/check.py', 'tools/gen.py', 'app/jobs/nightly.py'],
      modules: ['shop.server'],
    });
  });

  it('ignores unresolved variables and commands that run no Python file', () => {
    const root = projectWith({
      '.github/workflows/ci.yml':
        'jobs:\n  a:\n    steps:\n      - run: python $SCRIPT.py\n      - run: pytest tests/a.py\n      - run: echo python b.py\n      - name: python c.py\n',
    });

    expect(startedPythonFiles(root)).toEqual({ files: [], modules: [] });
  });

  it('reports nothing for a project without those files', () => {
    expect(startedPythonFiles(projectWith({}))).toEqual({ files: [], modules: [] });
  });
});
