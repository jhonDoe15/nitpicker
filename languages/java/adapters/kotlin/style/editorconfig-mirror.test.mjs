import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kotlinProjects } from '../test-support/kotlin-project.mjs';
import {
  isolatedWorkspace,
  mirroredWorkspace,
  projectEditorconfigs,
} from './editorconfig-mirror.mjs';

const { project, remove } = kotlinProjects();

afterEach(remove);

describe('the .editorconfig files of a listed project', () => {
  it('finds none in a project without any', () => {
    expect(projectEditorconfigs(project({ 'src/main/kotlin/A.kt': '' }))).toEqual({
      offset: '',
      editorconfigs: [],
      files: [],
    });
  });

  it('finds the ones under the project, at their paths', () => {
    const root = project({
      '.editorconfig': 'indent_size = 4\n',
      'src/main/kotlin/.editorconfig': '[*.kt]\nindent_size = 2\n',
      'src/main/kotlin/demo/.editorconfig': '[*.kt]\nindent_size = 8\n',
    });

    const found = projectEditorconfigs(root);

    expect(found.offset).toBe('');
    expect(found.editorconfigs.map(({ path: file }) => file)).toEqual([
      '.editorconfig',
      'src/main/kotlin/.editorconfig',
      'src/main/kotlin/demo/.editorconfig',
    ]);
    expect(found.files).toHaveLength(3);
  });

  it('adds the ancestors up to the repository root, keeping the path of the project in the repository', () => {
    const repository = project({
      '.git/HEAD': '',
      '.editorconfig': '[services/api/**.kt]\nindent_size = 2\n',
      'services/.editorconfig': 'max_line_length = 100\n',
      'services/api/.editorconfig': '[*.kt]\nindent_size = 4\n',
      'services/api/src/.editorconfig': '[*.kt]\nindent_size = 8\n',
    });

    const found = projectEditorconfigs(path.join(repository, 'services/api'));

    expect(found.offset).toBe('services/api');
    expect(found.editorconfigs.map(({ path: file }) => file)).toEqual([
      '.editorconfig',
      'services/.editorconfig',
      'services/api/.editorconfig',
      'services/api/src/.editorconfig',
    ]);
    expect(found.editorconfigs[0].text).toBe('[services/api/**.kt]\nindent_size = 2\n');
  });

  it('does not look above the repository root', () => {
    const outer = project({ '.editorconfig': 'indent_size = 1\n', 'repo/.git/HEAD': '' });

    expect(projectEditorconfigs(path.join(outer, 'repo')).editorconfigs).toEqual([]);
  });

  it('skips the folders a build or a package manager fills', () => {
    const root = project({
      'build/generated/.editorconfig': '',
      'node_modules/pkg/.editorconfig': '',
      '.gradle/.editorconfig': '',
      'src/.editorconfig': 'indent_size = 2\n',
    });

    expect(projectEditorconfigs(root).editorconfigs.map(({ path: file }) => file)).toEqual([
      'src/.editorconfig',
    ]);
  });
});

describe('the mirror workspace', () => {
  it('has only a root .editorconfig when the project is not listed', () => {
    expect(isolatedWorkspace()).toEqual({
      offset: '',
      editorconfigs: [{ path: '.editorconfig', text: 'root = true\n' }],
    });
  });

  it('puts root = true on the top .editorconfig only', () => {
    const workspace = mirroredWorkspace({
      offset: 'services/api',
      editorconfigs: [
        { path: '.editorconfig', text: 'indent_size = 2\n' },
        { path: 'services/api/.editorconfig', text: '[*.kt]\nindent_size = 4\n' },
      ],
    });

    expect(workspace).toEqual({
      offset: 'services/api',
      editorconfigs: [
        { path: '.editorconfig', text: 'root = true\n\nindent_size = 2\n' },
        { path: 'services/api/.editorconfig', text: '[*.kt]\nindent_size = 4\n' },
      ],
    });
  });

  it('adds a top .editorconfig when the files found are all nested', () => {
    expect(
      mirroredWorkspace({
        offset: '',
        editorconfigs: [{ path: 'src/.editorconfig', text: 'indent_size = 2\n' }],
      }).editorconfigs,
    ).toEqual([
      { path: '.editorconfig', text: 'root = true\n' },
      { path: 'src/.editorconfig', text: 'indent_size = 2\n' },
    ]);
  });
});
