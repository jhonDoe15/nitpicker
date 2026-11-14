import path from 'node:path';
import { NO_FILES, projectEnvironment } from './environment.mjs';
import { buildFixPlans } from './build-fix-plans.mjs';

/** The fix plans of the new findings of `report`, reading the project under `repositoryRoot`. */
export function fixPlansOf(report, { projectPath, repositoryRoot, reference }) {
  const env =
    repositoryRoot === undefined
      ? NO_FILES
      : projectEnvironment(path.join(repositoryRoot, projectPath ?? ''));
  return buildFixPlans(report.newFindings ?? [], { index: reference.index(), env });
}
