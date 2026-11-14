import { type FileMap, writeFiles } from './fixture-files.mts';
import { fixtureGit, useGitFixtures } from './git-repository.mts';

export function nestedCheckout(directory: string, files: FileMap): Record<string, string> {
  return {
    [`${directory}/.git`]: 'gitdir: /nonexistent/worktrees/nested\n',
    ...Object.fromEntries(
      Object.entries(files).map(([name, text]) => [`${directory}/${name}`, text]),
    ),
  };
}

export function useGitCheckouts(): {
  readonly gitCheckout: (files: FileMap, ignored?: readonly string[]) => string;
} {
  const { temporaryRoot } = useGitFixtures();

  function gitCheckout(files: FileMap, ignored: readonly string[] = []): string {
    const root = temporaryRoot('nitpicker-git-checkout-');
    fixtureGit(root, ['init', '-q']);
    writeFiles(root, { ...files, '.git/info/exclude': `${ignored.join('\n')}\n` });
    return root;
  }

  return { gitCheckout };
}
