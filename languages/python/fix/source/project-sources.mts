import type { PlanFile } from '../typed/fix-types.mts';
import { collectProjectFiles, createSnapshot } from '../typed/core-views.mts';

const PYTHON_FILE = /\.py$/u;

export function projectSources(projectRoot: string, files: readonly PlanFile[]): PlanFile[] {
  const known = new Set(files.map(({ path: name }) => name));
  const { files: listed } = collectProjectFiles({
    projectRoot,
    accepts: (name: string) => PYTHON_FILE.test(name) && !known.has(name),
    scope: undefined,
  });
  return createSnapshot(
    projectRoot,
    listed.map(({ path: name }) => name),
  ).files;
}
