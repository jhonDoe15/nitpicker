import { expect } from 'vitest';
import type { FixedProject, useFixtureProjects } from './fixture-project.mts';

type Projects = ReturnType<typeof useFixtureProjects>;

export function fixLeavingFileUnchanged(
  projects: Projects,
  files: Readonly<Record<string, string>>,
  request: Parameters<Projects['fix']>[1],
  file: string,
): FixedProject {
  const result = projects.fix(files, request);
  expect(result.tree[file]).toBe(files[file]);
  return result;
}
