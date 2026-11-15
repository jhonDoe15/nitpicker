import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import { startedPythonFiles } from './started-files.mjs';

const { temporaryRoot } = useGitFixtures();

function projectWith(files: Readonly<Record<string, string>>): string {
  const root = temporaryRoot('nitpicker-python-started-');
  writeFiles(root, files);
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
