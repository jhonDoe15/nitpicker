import { readHeadPolicy } from '../../typed/head-policy.mts';
import { DEPENDENCY_CRUISER_TOOL } from '../../../preset/project-tools/project-config-files.mjs';
import { projectToolLayer as untypedProjectToolLayer } from '../../../preset/project-tools/project-tool-policy.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { GraphLayer } from './dependency-cruiser-layers.mts';

const projectToolLayer: (tool: string, settings: unknown) => GraphLayer | undefined =
  untypedProjectToolLayer;

export function projectGraphLayer(
  { reportsConfigErrors }: { readonly reportsConfigErrors: unknown } = {
    reportsConfigErrors: false,
  },
): GraphLayer | undefined {
  const settings: unknown = Reflect.get(readHeadPolicy().tools, DEPENDENCY_CRUISER_TOOL);
  if (reportsConfigErrors !== true && fieldOf(settings, 'projectConfigError') !== undefined) {
    return undefined;
  }
  return projectToolLayer(DEPENDENCY_CRUISER_TOOL, settings);
}
