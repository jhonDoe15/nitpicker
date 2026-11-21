import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';

export { useTempProjects };

export const PROJECT = {
  qualifier: '',
  sourceRoots: ['src/main/java'],
  testSourceRoots: ['src/test/java'],
  kotlinSourceRoots: ['src/main/kotlin'],
  kotlinTestSourceRoots: ['src/test/kotlin'],
};

export function useScanner(
  prefix: string,
  read: (projectRoot: string, options: MainSourceOptions) => ReviewFinding[],
): (file: string, text: string, kotlin: boolean) => ReviewFinding[] {
  const projectWith = useTempProjects(prefix);
  return (file, text, kotlin) =>
    read(projectWith({ [file]: text }), { projects: [PROJECT], kotlin });
}
