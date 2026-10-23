import { runGit } from '../../diff/git/repository/command.mjs';

function lines(output) {
  return output.split('\0').filter(Boolean);
}

export function changedFiles({ repositoryRoot, mergeBaseSha }) {
  const tracked = runGit(repositoryRoot, [
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    mergeBaseSha,
  ]);
  const untracked = runGit(repositoryRoot, ['ls-files', '-z', '--others', '--exclude-standard']);
  return [...new Set([...lines(tracked), ...lines(untracked)])].toSorted();
}
