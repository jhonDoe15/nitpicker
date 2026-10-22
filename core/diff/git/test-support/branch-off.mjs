import { writeFiles } from './fixture-files.mjs';
import { fixtureGit } from './git-repository.mjs';

export function branchOff(root, branch) {
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  writeFiles(root, branch);
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'feature']);
}
