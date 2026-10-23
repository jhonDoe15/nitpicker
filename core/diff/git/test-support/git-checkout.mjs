import { writeFiles } from './fixture-files.mjs';
import { fixtureGit, useGitFixtures } from './git-repository.mjs';

export function nestedCheckout(directory, files) {
  return {
    [`${directory}/.git`]: 'gitdir: /nonexistent/worktrees/nested\n',
    ...Object.fromEntries(
      Object.entries(files).map(([name, text]) => [`${directory}/${name}`, text]),
    ),
  };
}

export function useGitCheckouts() {
  const { temporaryRoot } = useGitFixtures();

  function gitCheckout(files, ignored = []) {
    const root = temporaryRoot('nitpicker-git-checkout-');
    fixtureGit(root, ['init', '-q']);
    writeFiles(root, { ...files, '.git/info/exclude': `${ignored.join('\n')}\n` });
    return root;
  }

  return { gitCheckout };
}
