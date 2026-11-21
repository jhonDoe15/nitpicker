import { useTempProjects } from '../../shared/test-support/temp-projects.mts';

export type Files = Readonly<Record<string, string>>;

export function temporaryRepositories(prefix: string): (files: Files) => string {
  return useTempProjects(prefix);
}
