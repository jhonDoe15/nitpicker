import { type FileMap, writeFiles } from './fixture-files.mts';
import { fixtureGit } from './git-repository.mts';

export function branchOff(root: string, branch: FileMap): void {
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  writeFiles(root, branch);
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'feature']);
}
