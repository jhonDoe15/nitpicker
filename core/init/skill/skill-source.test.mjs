import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../help/package-version.mjs';
import { init, useProjects } from '../test-support/projects.mjs';
import { skillSource } from './skill-source.mjs';

const createProject = useProjects();
const INSTALLED = { 'node_modules/nitpicker/package.json': '{"version":"0.0.1"}' };
const PYTHON = { 'pyproject.toml': '[project]\nname = "app"\n', 'app/main.py': 'VALUE = 1\n' };

function skillSection(output) {
  const sections = output.split('\n\n');
  return sections.find((section) => section.startsWith('Install the agent skill:'));
}

function project(files) {
  return createProject(files, { repository: true });
}

describe('the source init prints for the agent skill', () => {
  it('is the installed package when the project has nitpicker in node_modules', () => {
    const root = project({ 'package.json': '{}', ...INSTALLED });

    expect(skillSource(root, { repository: root, version: '9.9.9' })).toBe(
      './node_modules/nitpicker',
    );
  });

  it('is the hoisted package of a workspace, relative to the project', () => {
    const root = project({ 'packages/app/package.json': '{}', ...INSTALLED });
    const app = path.join(root, 'packages', 'app');

    expect(skillSource(app, { repository: root, version: '9.9.9' })).toBe(
      '../../node_modules/nitpicker',
    );
  });

  it('follows a linked package, as pnpm installs it', () => {
    const root = project({ 'package.json': '{}', 'store/nitpicker/package.json': '{}' });
    mkdirSync(path.join(root, 'node_modules'));
    symlinkSync(
      path.join(root, 'store', 'nitpicker'),
      path.join(root, 'node_modules', 'nitpicker'),
    );

    expect(skillSource(root, { repository: root, version: '9.9.9' })).toBe(
      './node_modules/nitpicker',
    );
  });

  it('ignores a package installed above the repository', () => {
    const outer = createProject({ ...INSTALLED, 'repository/package.json': '{}' });
    const root = path.join(outer, 'repository');

    expect(skillSource(root, { repository: root, version: '1.2.3-rc.1' })).toBe(
      'jhonDoe15/nitpicker#v1.2.3-rc.1',
    );
  });

  it('is the release tag of the running version in a project without node_modules', () => {
    const root = project(PYTHON);

    expect(skillSection(init(root).stdoutText)).toBe(
      `Install the agent skill:\n  npx skills add jhonDoe15/nitpicker#v${packageVersion()} --skill nitpicker-python`,
    );
  });

  it('is printed by init for an installed package', () => {
    const root = project({
      'package.json': '{}',
      'src/index.ts': 'export const value = 1;\n',
      ...INSTALLED,
    });

    expect(skillSection(init(root).stdoutText)).toBe(
      'Install the agent skill:\n  npx skills add ./node_modules/nitpicker --skill nitpicker-typescript',
    );
  });
});
