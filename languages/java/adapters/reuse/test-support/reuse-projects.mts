import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';

export const JAVA_ROOT = 'src/main/java';
export const KOTLIN_ROOT = 'src/main/kotlin';
export const SINGLE_PROJECT = [
  { qualifier: '', sourceRoots: [JAVA_ROOT], kotlinSourceRoots: [KOTLIN_ROOT] },
];

export function createReuseProjects(): {
  project: (files: Readonly<Record<string, string>>) => string;
} {
  const { temporaryRoot } = useGitFixtures();
  function project(files: Readonly<Record<string, string>>): string {
    const root = temporaryRoot('jvm-reuse-');
    writeFiles(root, files);
    return root;
  }
  return { project };
}
