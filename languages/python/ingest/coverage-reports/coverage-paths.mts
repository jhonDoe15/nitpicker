import { projectPath } from '../type-check.mjs';

export const reportedPath: (
  file: string,
  roots: readonly (string | undefined)[],
) => string | undefined = projectPath;
