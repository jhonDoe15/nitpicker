import { precedenceLayers } from '../../../../shared/conventions/tool-precedence.mjs';
import { readStrykerProjectConfig } from './stryker-project-config.mjs';

const PROJECT_CONFIG_READERS = new Map([['stryker', readStrykerProjectConfig]]);
const HEAD_KEYS = ['projectConfig', 'projectConfigError'];

function captured(read, projectRoot) {
  try {
    return { projectConfig: read(projectRoot) };
  } catch (error) {
    return { projectConfigError: error instanceof Error ? error.message : String(error) };
  }
}

function readsProject(tool, settings) {
  return PROJECT_CONFIG_READERS.has(tool) && precedenceLayers(settings?.precedence).usesProject;
}

export function withHeadToolConfigs(tools, projectRoot) {
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => [
      tool,
      readsProject(tool, settings)
        ? { ...settings, ...captured(PROJECT_CONFIG_READERS.get(tool), projectRoot) }
        : settings,
    ]),
  );
}

export function headToolConfigFacts(tools, headTools = {}) {
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => {
      if (!readsProject(tool, settings)) {
        return [tool, settings];
      }
      const head = headTools[tool] ?? {};
      const facts = HEAD_KEYS.filter((key) => head[key] !== undefined).map((key) => [
        key,
        head[key],
      ]);
      return [tool, { ...settings, ...Object.fromEntries(facts) }];
    }),
  );
}
