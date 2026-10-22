import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { hasProjectFile, insideProject } from './inside-project.mjs';

const project = useProjects();

describe('project file access', () => {
  it('resolves a name inside the project', () => {
    expect(insideProject('/work/app', 'a/b.json')).toBe('/work/app/a/b.json');
  });

  it('refuses a name that leaves the project', () => {
    expect(() => insideProject('/work/app', '../other.json')).toThrow(
      '../other.json is outside /work/app',
    );
  });

  it('tells which of the names exist', () => {
    const root = project({ 'a.txt': '' });

    expect(hasProjectFile(root, 'b.txt', 'a.txt')).toBe(true);
    expect(hasProjectFile(root, 'b.txt')).toBe(false);
    expect(hasProjectFile(root)).toBe(false);
  });
});
