import { precedenceLayers } from '../../../../shared/conventions/tool-precedence.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { pickedKeys } from './config-module.mjs';
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
]);
const HEAD_KEYS = ['projectConfig', 'projectConfigError'];

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

export function withHeadToolConfigs(policy, config, projectRoot) {
  const context = { policy, config };
  return Object.fromEntries(
    Object.entries(policy.tools).map(([tool, settings]) => {
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

export function headProjectConfigFacts(settings, headSettings = {}) {
  if (HEAD_KEYS.every((key) => headSettings[key] === undefined)) {
    return { ...headSettings, precedence: headSettings.precedence ?? ['nitpicker'] };
  }
  return { ...settings, ...pickedKeys(headSettings, HEAD_KEYS) };
}
