import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { movedPackages } from '../../comparison/moved-names/packages/moved-packages.mjs';
import { commit, fixtureGit } from '../test-support/git-repository.mjs';
import { writeFiles } from '../test-support/fixture-files.mjs';
import { readBaseFiles, readHeadFiles, readProjectMoves } from './project-moves.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-')));
  roots.push(root);
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  writeFiles(root, files);
  commit(root, 'base');
  return root;
}

function revisions(root) {
  return fixtureGit(root, ['rev-parse', 'HEAD~1', 'HEAD']).trim().split('\n');
}

const BODY = (name) =>
  `package shop;\n\npublic class ${name} {\n  int total() {\n    return 1;\n  }\n}\n`;

describe('the base files and the packages that moved', () => {
  it('lists the base files of the project and finds the package that moved as a whole', () => {
    const root = repository({
      'app/src/main/java/shop/service/Audit.java': BODY('Audit'),
      'app/src/main/java/shop/service/Request.java': BODY('Request'),
      'app/src/main/java/shop/web/Page.java': BODY('Page'),
      'other/Readme.md': 'text\n',
    });
    fixtureGit(root, ['mv', 'app/src/main/java/shop/service', 'app/src/main/java/shop/audit']);
    commit(root, 'move');
    const [mergeBaseSha, headSha] = revisions(root);
    const options = { repositoryRoot: root, mergeBaseSha, headSha, projectRelativePath: 'app' };

    const baseFiles = readBaseFiles(options);
    const { files } = readProjectMoves(options);

    expect(baseFiles.toSorted()).toEqual([
      'src/main/java/shop/service/Audit.java',
      'src/main/java/shop/service/Request.java',
      'src/main/java/shop/web/Page.java',
    ]);
    const headFiles = readHeadFiles(options);
    expect(movedPackages({ baseFiles, headFiles, renames: files }).get('shop.service')).toBe(
      'shop.audit',
    );
  });

  it('keeps a package that left a file behind', () => {
    const root = repository({
      'src/main/java/shop/service/Audit.java': BODY('Audit'),
      'src/main/java/shop/service/Stays.java': BODY('Stays'),
    });
    fixtureGit(root, [
      'mv',
      'src/main/java/shop/service/Audit.java',
      'src/main/java/shop/Audit.java',
    ]);
    commit(root, 'move one file');
    const [mergeBaseSha, headSha] = revisions(root);
    const options = { repositoryRoot: root, mergeBaseSha, headSha, projectRelativePath: '.' };

    const { files } = readProjectMoves(options);

    expect(
      movedPackages({
        baseFiles: readBaseFiles(options),
        headFiles: readHeadFiles(options),
        renames: files,
      }).has('shop.service'),
    ).toBe(false);
  });
});
