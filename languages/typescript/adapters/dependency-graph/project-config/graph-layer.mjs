import { readHeadPolicy } from '../../../preset/head-policy.mjs';
import { DEPENDENCY_CRUISER_TOOL } from '../../../preset/project-tools/project-config-files.mjs';
import { projectToolLayer } from '../../../preset/project-tools/project-tool-policy.mjs';

export function projectGraphLayer({ reportsConfigErrors = false } = {}) {
  const settings = readHeadPolicy().tools[DEPENDENCY_CRUISER_TOOL];
  if (!reportsConfigErrors && settings?.projectConfigError !== undefined) {
    return undefined;
  }
  return projectToolLayer(DEPENDENCY_CRUISER_TOOL, settings);
}
