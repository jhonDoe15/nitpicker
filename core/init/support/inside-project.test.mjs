import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { hasProjectFile, insideProject, writableProjectFile } from './inside-project.mjs';

const project = useProjects();
const ADVICE =
  'so nitpicker init does not write through it. Replace the link with a file, or make the change by hand.';

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

describe('files init may write', () => {
  it('allows a new file, an existing one and a link that stays inside the project', () => {
    const root = project({ 'docs/AGENTS.md': '' });
    symlinkSync(`${root}/docs/AGENTS.md`, `${root}/AGENTS.md`);

    expect(writableProjectFile(root, 'a/new.yml')).toBe(`${root}/a/new.yml`);
    expect(writableProjectFile(root, 'docs/AGENTS.md')).toBe(`${root}/docs/AGENTS.md`);
    expect(writableProjectFile(root, 'AGENTS.md')).toBe(`${root}/AGENTS.md`);
  });

  it('refuses a link to a file outside the project', () => {
    const root = project({});
    const outside = project({ 'notes.md': 'mine\n' });
    symlinkSync(`${outside}/notes.md`, `${root}/AGENTS.md`);

    expect(() => writableProjectFile(root, 'AGENTS.md')).toThrow(
      `AGENTS.md resolves through a symbolic link to ${outside}/notes.md, outside ${root}, ${ADVICE}`,
    );
  });

  it('refuses a folder link that leads outside the project', () => {
    const root = project({});
    const outside = project({});
    mkdirSync(`${outside}/workflows`);
    writeFileSync(`${outside}/workflows/keep`, '');
    symlinkSync(outside, `${root}/.github`);

    expect(() => writableProjectFile(root, '.github/workflows/nitpicker.yml')).toThrow(
      `.github/workflows/nitpicker.yml resolves through a symbolic link to ${outside}/workflows/nitpicker.yml, outside ${root}, ${ADVICE}`,
    );
  });

  it('refuses a link to a missing file, which a write would create wherever it points', () => {
    const root = project({});
    symlinkSync('/nonexistent/nitpicker.config.json', `${root}/nitpicker.config.json`);

    expect(() => writableProjectFile(root, 'nitpicker.config.json')).toThrow(
      `nitpicker.config.json is a symbolic link to a missing file, ${ADVICE}`,
    );
  });
});
