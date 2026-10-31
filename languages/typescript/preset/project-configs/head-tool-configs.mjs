import { precedenceLayers } from '../../../../shared/conventions/tool-precedence.mjs';
import { mutationDisabled, readStrykerProjectConfig } from './stryker-project-config.mjs';

const PROJECT_CONFIG_READERS = new Map([['stryker', readStrykerProjectConfig]]);

function captured(read, projectRoot) {
  try {
    return { projectConfig: read(projectRoot) };
  } catch (error) {
    return { projectConfigError: error instanceof Error ? error.message : String(error) };
  }
}

function readsProject(tool, settings, config) {
  return (
    PROJECT_CONFIG_READERS.has(tool) &&
    precedenceLayers(settings?.precedence).usesProject &&
    !mutationDisabled(config)
  );
}

export function withHeadToolConfigs(tools, config, projectRoot) {
  if (tools === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => [
      tool,
      readsProject(tool, settings, config)
        ? { ...settings, ...captured(PROJECT_CONFIG_READERS.get(tool), projectRoot) }
        : settings,
    ]),
  );
}
