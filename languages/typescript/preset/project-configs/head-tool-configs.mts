import { messageOf } from '../../../../shared/values/readers.mts';
import { precedenceLayers } from '../project-tools/typed/shared-views.mts';
import type {
  PrecedenceLayers,
  ToolPolicy,
  ToolSettings,
  ToolsMap,
} from '../project-tools/typed/tool-types.mts';
import { resolveLayoutFor } from '../layout.mts';
import { TESTS_TOOL, readTestRunnerProjectConfig } from './test-runner/test-runner-config.mts';
import { mutationDisabled, readStrykerProjectConfig } from './stryker-project-config.mts';
import {
  TYPESCRIPT_TOOL,
  readTypescriptProjectConfig,
} from './typescript/typescript-project-options.mts';

type ReadContext = { readonly policy: ToolPolicy; readonly config: ToolPolicy };

type ConfigReader = {
  read: (projectRoot: string, context: ReadContext) => unknown;
  applies: (context: ReadContext & { readonly layers: PrecedenceLayers }) => boolean;
};

const PROJECT_CONFIG_READERS = new Map<string, ConfigReader>([
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

function captured(
  reader: ConfigReader,
  projectRoot: string,
  context: ReadContext,
): { projectConfig: unknown } | { projectConfigError: string } {
  try {
    return { projectConfig: reader.read(projectRoot, context) };
  } catch (error) {
    return { projectConfigError: messageOf(error) };
  }
}

function readerFor(
  tool: string,
  settings: ToolSettings | undefined,
  context: ReadContext,
): ConfigReader | undefined {
  const reader = PROJECT_CONFIG_READERS.get(tool);
  const layers = precedenceLayers(settings?.precedence);
  return layers.usesProject && reader?.applies({ ...context, layers }) ? reader : undefined;
}

export function withHeadToolConfigs(
  tools: ToolsMap | undefined,
  context: ReadContext,
  projectRoot: string,
): Record<string, ToolSettings | undefined> | undefined {
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
