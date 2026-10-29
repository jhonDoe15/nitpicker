import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { mutationDisabled, STRYKER_TOOL, strykerProjectFile } from './stryker-project-config.mjs';

export function strykerIgnoredNotices({ config, projectRoot }) {
  if (
    mutationDisabled(config) ||
    precedenceLayers(config.tools?.[STRYKER_TOOL]?.precedence).usesProject
  ) {
    return [];
  }
  const file = strykerProjectFile(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, STRYKER_TOOL)];
}
