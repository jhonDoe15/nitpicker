import { precedenceLayers } from '../../../../shared/conventions/tool-precedence.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { readStrykerProjectConfig } from './stryker-project-config.mjs';
import { TESTS_TOOL, readTestRunnerProjectConfig } from './test-runner-config.mjs';
import { TYPESCRIPT_TOOL, readTypescriptProjectConfig } from './typescript-project-options.mjs';

const PROJECT_CONFIG_READERS = new Map([
  ['stryker', readStrykerProjectConfig],
  [
    TYPESCRIPT_TOOL,
    (projectRoot, policy) => readTypescriptProjectConfig(projectRoot, resolveLayoutFor(policy)),
  ],
  [TESTS_TOOL, readTestRunnerProjectConfig],
]);
const HEAD_KEYS = ['projectConfig', 'projectConfigError'];

function captured(read, projectRoot, policy) {
  try {
    return { projectConfig: read(projectRoot, policy) };
  } catch (error) {
    return { projectConfigError: error instanceof Error ? error.message : String(error) };
  }
}

function readsProject(tool, settings) {
  return PROJECT_CONFIG_READERS.has(tool) && precedenceLayers(settings?.precedence).usesProject;
}

export function withHeadToolConfigs(policy, projectRoot) {
  return Object.fromEntries(
    Object.entries(policy.tools).map(([tool, settings]) => [
      tool,
      readsProject(tool, settings)
        ? { ...settings, ...captured(PROJECT_CONFIG_READERS.get(tool), projectRoot, policy) }
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
