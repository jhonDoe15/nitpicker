import { precedenceLayers } from '../../../../shared/conventions/tool-precedence.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { TESTS_TOOL, readTestRunnerProjectConfig } from './test-runner/test-runner-config.mjs';
import { mutationDisabled, readStrykerProjectConfig } from './stryker-project-config.mjs';
import {
  TYPESCRIPT_TOOL,
  readTypescriptProjectConfig,
} from './typescript/typescript-project-options.mjs';

const PROJECT_CONFIG_READERS = new Map([
  [
    'stryker',
    {
      read: (projectRoot) => readStrykerProjectConfig(projectRoot),
      applies: ({ config }) => !mutationDisabled(config),
    },
  ],
  [
    TYPESCRIPT_TOOL,
    {
      read: (projectRoot, { policy }) =>
        readTypescriptProjectConfig(projectRoot, resolveLayoutFor(policy)),
      applies: ({ layers }) => !layers.nitpickerFirst,
    },
  ],
  [
    TESTS_TOOL,
    {
      read: (projectRoot, { policy }) => readTestRunnerProjectConfig(projectRoot, policy),
      applies: ({ layers }) => !layers.nitpickerFirst,
    },
  ],
]);

function captured(reader, projectRoot, context) {
  try {
    return { projectConfig: reader.read(projectRoot, context) };
  } catch (error) {
    return { projectConfigError: error instanceof Error ? error.message : String(error) };
  }
}

function readerFor(tool, settings, context) {
  const reader = PROJECT_CONFIG_READERS.get(tool);
  const layers = precedenceLayers(settings?.precedence);
  return layers.usesProject && reader?.applies({ ...context, layers }) ? reader : undefined;
}

export function withHeadToolConfigs(tools, context, projectRoot) {
  if (tools === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => {
      const reader = readerFor(tool, settings, context);
      return [
        tool,
        reader === undefined
          ? settings
          : { ...settings, ...captured(reader, projectRoot, context) },
      ];
    }),
  );
}
