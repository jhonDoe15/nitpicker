import { readFileSync } from 'node:fs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { insideProject } from '../support/inside-project.mjs';

export function readText(root, name) {
  return readFileSync(insideProject(root, name), 'utf8');
}

export function useProjects() {
  const { temporaryRoot } = useGitFixtures();
  return function project(files, { repository = false } = {}) {
    const root = temporaryRoot('nitpicker-init-');
    writeFiles(root, files);
    if (repository) {
      fixtureGit(root, ['init', '-q', '--initial-branch=main']);
    }
    return root;
  };
}
