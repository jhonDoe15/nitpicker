import { listOf as untypedListOf, picked as untypedPicked } from '../../../../../shared/config.mjs';
import { precedenceLayers as untypedPrecedenceLayers } from '../../../../../shared/conventions/tool-precedence.mjs';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import type { KnipConfig } from '../typed/policy.mts';

export type KnipLayer = { readonly precedence: string[] | undefined; readonly config: KnipConfig };

const listOf: (value: unknown) => unknown[] = untypedListOf;
const picked: (source: KnipConfig, keys: readonly string[]) => KnipConfig = untypedPicked;
const precedenceLayers: (precedence: string[] | undefined) => { readonly nitpickerFirst: boolean } =
  untypedPrecedenceLayers;

const ADDED_LISTS = [
  'ignore',
  'ignoreFiles',
  'ignoreDependencies',
  'ignoreBinaries',
  'ignoreMembers',
  'ignoreUnresolved',
  'ignoreWorkspaces',
];
const RANKED_KEYS = [
  'rules',
  'include',
  'exclude',
  'ignoreExportsUsedInFile',
  'includeEntryExports',
  'cycles',
  'tags',
];
const WORKSPACE_KEYS = [
  'entry',
  'project',
  'paths',
  'ignore',
  'ignoreFiles',
  'ignoreBinaries',
  'ignoreDependencies',
  'ignoreMembers',
  'ignoreUnresolved',
  'ignoreExportsUsedInFile',
  'ignoreIssues',
  'includeEntryExports',
];
const ROOT_KEYS = new Set([
  ...ADDED_LISTS,
  ...RANKED_KEYS,
  ...WORKSPACE_KEYS,
  '$schema',
  'workspaces',
  'compilers',
  'syncCompilers',
  'asyncCompilers',
  'treatConfigHintsAsErrors',
  'treatTagHintsAsErrors',
]);
const ROOT_WORKSPACE = '.';

function isNegated(pattern: unknown): boolean {
  return typeof pattern === 'string' && pattern.startsWith('!');
}

function pluginsOf(config: KnipConfig): KnipConfig {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !ROOT_KEYS.has(key)));
}

function projectRootConfig({ workspaces, ...root }: KnipConfig): KnipConfig {
  return { ...root, ...fieldsOf(fieldOf(workspaces, ROOT_WORKSPACE)) };
}

function nestedWorkspaces(config: KnipConfig): KnipConfig {
  const nested = Object.entries(fieldsOf(fieldOf(config, 'workspaces'))).filter(
    ([key]) => key !== ROOT_WORKSPACE,
  );
  return nested.length === 0 ? {} : { workspaces: Object.fromEntries(nested) };
}

function ignoredIssues(...layers: readonly unknown[]): KnipConfig {
  const merged: Record<string, unknown[]> = {};
  for (const [pattern, types] of layers.flatMap((layer) => Object.entries(fieldsOf(layer)))) {
    merged[pattern] = [...new Set([...(merged[pattern] ?? []), ...listOf(types)])];
  }
  return Object.keys(merged).length === 0 ? {} : { ignoreIssues: merged };
}

function rankedValues(
  nitpicker: KnipConfig,
  project: KnipConfig,
  nitpickerFirst: boolean,
): KnipConfig {
  if (nitpickerFirst) {
    return {};
  }
  const rules =
    fieldOf(project, 'rules') === undefined
      ? {}
      : {
          rules: {
            ...fieldsOf(fieldOf(nitpicker, 'rules')),
            ...fieldsOf(fieldOf(project, 'rules')),
          },
        };
  return { ...picked(project, RANKED_KEYS), ...rules };
}

function lowestFirst(
  nitpicker: KnipConfig,
  project: KnipConfig,
  nitpickerFirst: boolean,
): readonly [KnipConfig, KnipConfig] {
  return nitpickerFirst ? [project, nitpicker] : [nitpicker, project];
}

function environment(
  nitpicker: KnipConfig,
  project: KnipConfig,
  nitpickerFirst: boolean,
): KnipConfig {
  const [low, high] = lowestFirst(nitpicker, project, nitpickerFirst);
  const paths = { ...fieldsOf(fieldOf(low, 'paths')), ...fieldsOf(fieldOf(high, 'paths')) };
  return {
    ...pluginsOf(low),
    ...pluginsOf(high),
    ...(Object.keys(paths).length === 0 ? {} : { paths }),
  };
}

export function layeredKnipConfig(nitpicker: KnipConfig, layer: KnipLayer | undefined): KnipConfig {
  if (layer === undefined) {
    return nitpicker;
  }
  const project = projectRootConfig(layer.config);
  const { nitpickerFirst } = precedenceLayers(layer.precedence);
  return {
    ...nitpicker,
    ...environment(nitpicker, project, nitpickerFirst),
    ...rankedValues(nitpicker, project, nitpickerFirst),
    ...Object.fromEntries(
      ADDED_LISTS.map((key) => addedList(key, nitpicker, project)).filter(
        ([, values]) => values.length > 0,
      ),
    ),
    ...ignoredIssues(fieldOf(nitpicker, 'ignoreIssues'), fieldOf(project, 'ignoreIssues')),
    entry: [
      ...listOf(fieldOf(nitpicker, 'entry')),
      ...listOf(fieldOf(project, 'entry')).filter((item) => !isNegated(item)),
    ],
    project: [
      ...listOf(fieldOf(nitpicker, 'project')),
      ...listOf(fieldOf(project, 'project')).filter(isNegated),
    ],
    ...nestedWorkspaces(layer.config),
  };
}

function addedList(key: string, nitpicker: KnipConfig, project: KnipConfig): [string, unknown[]] {
  return [key, [...listOf(fieldOf(nitpicker, key)), ...listOf(fieldOf(project, key))]];
}

export function writtenKnipConfig(config: KnipConfig): KnipConfig {
  if (fieldOf(config, 'workspaces') === undefined) {
    return config;
  }
  const root = { ...picked(config, WORKSPACE_KEYS), ...pluginsOf(config) };
  return {
    ...config,
    workspaces: { [ROOT_WORKSPACE]: root, ...fieldsOf(fieldOf(config, 'workspaces')) },
  };
}
