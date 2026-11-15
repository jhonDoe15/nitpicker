import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { useGitFixtures } from '../../../../../../core/diff/git/test-support/git-repository.mts';

type TempProjects = {
  tempRoot: () => string;
  projectWith: (files: Record<string, string>) => string;
};

export function useTempProjects(prefix: string): TempProjects {
  const { temporaryRoot } = useGitFixtures();

  function tempRoot() {
    return temporaryRoot(prefix);
  }

  function projectWith(files: Record<string, string>) {
    const root = tempRoot();
    for (const [relative, text] of Object.entries(files)) {
      const full = path.resolve(root, relative);
      if (!full.startsWith(root + path.sep)) {
        throw new Error(`${relative} is outside ${root}`);
      }
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return root;
  }

  return { tempRoot, projectWith };
}
