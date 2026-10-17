import { afterEach, describe, expect, it } from 'vitest';
import { dependenciesDiffer } from './dependency-files.mjs';
import {
  pyproject,
  removeTemporaryRoots,
  temporaryRoot as registeredTemporaryRoot,
  writeAll,
} from './test-support/temporary-projects.mjs';

const roots = [];
function temporaryRoot() {
  return registeredTemporaryRoot(roots);
}

afterEach(() => {
  removeTemporaryRoots(roots);
});

describe('comparing the dependency files of base and head', () => {
  it.each([
    ['a changed lock file', { 'uv.lock': 'a' }, { 'uv.lock': 'b' }, true],
    ['a lock file only the head has', {}, { 'poetry.lock': 'a' }, true],
    [
      'a changed requirements file',
      { 'requirements.txt': 'a==1' },
      { 'requirements.txt': 'a==2' },
      true,
    ],
    [
      'a changed requirements folder file',
      { 'requirements/dev.txt': 'a' },
      { 'requirements/dev.txt': 'b' },
      true,
    ],
    [
      'a changed dependency in pyproject.toml',
      { 'pyproject.toml': pyproject('a==1') },
      { 'pyproject.toml': pyproject('a==2') },
      true,
    ],
    [
      'a changed poetry group',
      { 'pyproject.toml': '[tool.poetry.group.dev.dependencies]\na = "1"\n' },
      { 'pyproject.toml': '[tool.poetry.group.dev.dependencies]\na = "2"\n' },
      true,
    ],
    [
      'other pyproject.toml settings',
      { 'pyproject.toml': pyproject('a==1', '[tool.ruff]\nline-length = 80\n') },
      { 'pyproject.toml': pyproject('a==1', '[tool.ruff]\nline-length = 100\n') },
      false,
    ],
    [
      'equal files',
      { 'uv.lock': 'a', 'requirements.txt': 'a' },
      { 'uv.lock': 'a', 'requirements.txt': 'a' },
      false,
    ],
    [
      'a requirements file that is not for dependencies',
      { 'notes.txt': 'a' },
      { 'notes.txt': 'b' },
      false,
    ],
  ])('%s', (_label, baseFiles, headFiles, differs) => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    writeAll(base, baseFiles);
    writeAll(head, headFiles);

    expect(dependenciesDiffer(base, head)).toBe(differs);
  });
});
