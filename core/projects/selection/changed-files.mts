import { runGit } from '../../diff/git/repository/command.mts';
import { byText } from '../../../shared/text-order/by-text.mjs';

function lines(output: string): string[] {
  return output.split('\0').filter(Boolean);
}

export function changedFiles({
  repositoryRoot,
  mergeBaseSha,
}: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
}): string[] {
  const tracked = runGit(repositoryRoot, [
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    mergeBaseSha,
  ]);
  const untracked = runGit(repositoryRoot, ['ls-files', '-z', '--others', '--exclude-standard']);
  return [...new Set([...lines(tracked), ...lines(untracked)])].toSorted(byText);
}
