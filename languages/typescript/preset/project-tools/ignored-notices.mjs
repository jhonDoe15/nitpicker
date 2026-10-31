import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { projectConfigSources, projectConfigTools } from './project-config-files.mjs';

export function scriptProjectToolNotices({ config, projectRoot }) {
  return projectConfigTools()
    .filter((tool) => !precedenceLayers(config.tools?.[tool]?.precedence).usesProject)
    .flatMap((tool) => {
      const sources = projectConfigSources(tool, projectRoot);
      return sources === undefined ? [] : [ignoredConfigNotice(sources.label, tool)];
    });
}
