import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { PROJECT_CONFIG_FILES, projectConfigSources } from './project-config-files.mjs';

function ignoredProjectToolNotices(config, projectRoot) {
  return [...PROJECT_CONFIG_FILES.keys()]
    .filter((tool) => !precedenceLayers(config.tools?.[tool]?.precedence).usesProject)
    .flatMap((tool) => {
      const sources = projectConfigSources(tool, projectRoot);
      return sources === undefined ? [] : [ignoredConfigNotice(sources.label, tool)];
    });
}

export function scriptProjectToolStyle({ config, projectRoot }) {
  return {
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => ignoredProjectToolNotices(config, projectRoot),
  };
}
