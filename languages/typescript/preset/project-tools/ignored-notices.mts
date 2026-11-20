import type { ToolPolicy } from './typed/tool-types.mts';
import { ignoredConfigNotice, precedenceLayers } from './typed/shared-views.mts';
import { projectConfigSources, projectConfigTools } from './project-config-files.mts';

export function scriptProjectToolNotices({
  config,
  projectRoot,
}: {
  readonly config: ToolPolicy;
  readonly projectRoot: string;
}): string[] {
  return projectConfigTools()
    .filter((tool) => !precedenceLayers(config.tools?.[tool]?.precedence).usesProject)
    .flatMap((tool) => {
      const sources = projectConfigSources(tool, projectRoot);
      return sources === undefined ? [] : [ignoredConfigNotice(sources.label, tool)];
    });
}
