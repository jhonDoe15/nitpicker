import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { STRYKER_TOOL, strykerProjectFile } from './stryker-project-config.mjs';

function optedIn(config, tool) {
  return precedenceLayers(config.tools?.[tool]?.precedence).usesProject;
}

function strykerNotices(config, projectRoot) {
  if ((config.disable ?? []).includes('mutation') || optedIn(config, STRYKER_TOOL)) {
    return [];
  }
  const file = strykerProjectFile(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, STRYKER_TOOL)];
}

export function ignoredScriptToolNotices({ config, projectRoot }) {
  return strykerNotices(config, projectRoot);
}

export function scriptProjectStyle(context) {
  return {
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => ignoredScriptToolNotices(context),
  };
}
