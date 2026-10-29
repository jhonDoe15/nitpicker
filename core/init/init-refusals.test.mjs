import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { init, useProjects } from './test-support/projects.mjs';

const createProject = useProjects();
const TYPESCRIPT = { 'package.json': '{}', 'src/index.ts': 'export const value = 1;\n' };

function project(files = TYPESCRIPT) {
  return createProject(files, { repository: true });
}

describe('nitpicker init stops before writing anything', () => {
  it('when AGENTS.md is a folder', () => {
    const root = project();
    mkdirSync(path.join(root, 'AGENTS.md'));

    expect(init(root, '--agents-md')).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: AGENTS.md is a folder, so nitpicker init cannot write it as a file. Rename or remove the folder, or make the change by hand.\n',
    });
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('when .github is a file', () => {
    const root = project({ ...TYPESCRIPT, '.github': 'notes\n' });

    expect(init(root, '--ci', 'github')).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: .github is a file, so nitpicker init cannot create .github/workflows/nitpicker.yml inside it. Rename or remove .github, or make the change by hand.\n',
    });
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('when nitpicker.config.json is a folder', () => {
    const root = project();
    mkdirSync(path.join(root, 'nitpicker.config.json'));

    expect(init(root)).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: nitpicker.config.json is a folder, so nitpicker init cannot write it as a file. Rename or remove the folder, or make the change by hand.\n',
    });
  });
});
