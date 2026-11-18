import { projectPath } from '../type-check.mts';

export const reportedPath: (
  file: string,
  roots: readonly (string | undefined)[],
) => string | undefined = projectPath;
