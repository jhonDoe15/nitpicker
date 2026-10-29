import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { readLayeredConfig } from './read-layered.mjs';
import { configLayersOf } from './shared-files.mjs';

const git = useGitFixtures();

function repository(files) {
  return git.createGitRepository(files, { prefix: 'nitpicker-inherited-' }).root;
}

function member(root, folder = 'packages/a', overlay = {}) {
  return readLayeredConfig(path.join(root, folder), {
    overlay: { inherits: path.relative(folder, '.').split(path.sep).join('/'), ...overlay },
  });
}

describe('the root config of a monorepo as the base layer of each member', () => {
  it('gives a member the root settings, with root paths rebased onto the member', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({
        exclude: ['packages/a/src/**', 'packages/b/**', '**/generated/**'],
        disable: ['knip'],
        thresholds: { fileLines: 400 },
        exceptions: [
          { rule: 'file-lines-limit', paths: ['packages/*/src/big.ts'], reason: 'tables' },
          { rule: 'file-lines-limit', paths: ['packages/b/x.ts'], reason: 'other member' },
        ],
        layout: { entryPoints: ['packages/a/scripts/**'], sourceRoots: ['packages/a/lib'] },
      }),
      'packages/a/src/a.ts': '',
    });

    expect(member(root)).toEqual({
      exclude: ['src/**', '**/generated/**'],
      disable: ['knip'],
      thresholds: { fileLines: 400 },
      exceptions: [{ rule: 'file-lines-limit', paths: ['src/big.ts'], reason: 'tables' }],
      layout: { entryPoints: ['scripts/**'], sourceRoots: ['lib'] },
    });
  });

  it('lets the member config override the root one key by key and does not inherit projects', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({
        projects: ['packages/a'],
        exclude: ['**/legacy/**'],
        thresholds: { fileLines: 400, folderFiles: 9 },
      }),
      'packages/a/nitpicker.config.json': JSON.stringify({
        exclude: ['vendor/**'],
        thresholds: { fileLines: 250 },
      }),
    });

    expect(member(root)).toEqual({
      exclude: ['vendor/**'],
      thresholds: { fileLines: 250, folderFiles: 9 },
    });
  });

  it('names the root config when an inherited setting is invalid', () => {
    const root = repository({
      'nitpicker.config.json': '{"thresholds":{"fileLines":"long"}}',
      'packages/a/src/a.ts': '',
    });

    expect(() => member(root)).toThrow('../../nitpicker.config.json');
  });

  it('inherits nothing into a member of another language than the root', () => {
    const root = repository({
      'nitpicker.config.json': '{"exclude":["api/**"],"disable":["knip"]}',
      'package.json': '{"workspaces":["web"]}',
      'api/pyproject.toml': '[project]\nname = "api"\n',
    });

    expect(member(root, 'api', { preset: 'python', declared: true })).toEqual({ preset: 'python' });
  });

  it('passes the root preset to a member that sets none', () => {
    const root = repository({
      'nitpicker.config.json': '{"preset":"javascript"}',
      'packages/a/index.js': '',
    });

    expect(member(root)).toEqual({ preset: 'javascript' });
  });

  it('puts the root config into the shared files of a member policy digest', () => {
    const root = repository({
      'nitpicker.config.json': '{"exclude":["packages/a/src/**"]}',
      'packages/a/src/a.ts': '',
    });
    const blobId = (content) => `blob:${content.length}`;
    const projectRoot = path.join(root, 'packages/a');

    expect(configLayersOf(projectRoot, projectRoot, { blobId, inherits: '../..' })).toEqual({
      shared: [['../../nitpicker.config.json', 'blob:33']],
      changed: [],
    });
    expect(configLayersOf(projectRoot, projectRoot, { blobId }).shared).toEqual([]);
  });
});
