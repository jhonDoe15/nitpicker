import { picked } from '../../../../../shared/config.mjs';
import { precedenceLayers } from '../../../../../shared/conventions/tool-precedence.mjs';
import { listOf } from '../../../preset/project-tools/config-values.mjs';

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

function isNegated(pattern) {
  return typeof pattern === 'string' && pattern.startsWith('!');
}

function pluginsOf(config) {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !ROOT_KEYS.has(key)));
}

function projectRootConfig({ workspaces, ...root }) {
  return { ...root, ...workspaces?.[ROOT_WORKSPACE] };
}

function nestedWorkspaces(config) {
  const nested = Object.entries(config.workspaces ?? {}).filter(([key]) => key !== ROOT_WORKSPACE);
  return nested.length === 0 ? {} : { workspaces: Object.fromEntries(nested) };
}

function ignoredIssues(...layers) {
  const merged = {};
  for (const [pattern, types] of layers.flatMap((layer) => Object.entries(layer ?? {}))) {
    merged[pattern] = [...new Set([...(merged[pattern] ?? []), ...types])];
  }
  return Object.keys(merged).length === 0 ? {} : { ignoreIssues: merged };
}

function rankedValues(nitpicker, project, nitpickerFirst) {
  if (nitpickerFirst) {
    return {};
  }
  const rules =
    project.rules === undefined ? {} : { rules: { ...nitpicker.rules, ...project.rules } };
  return { ...picked(project, RANKED_KEYS), ...rules };
}

function lowestFirst(nitpicker, project, nitpickerFirst) {
  return nitpickerFirst ? [project, nitpicker] : [nitpicker, project];
}

function environment(nitpicker, project, nitpickerFirst) {
  const [low, high] = lowestFirst(nitpicker, project, nitpickerFirst);
  const paths = { ...low.paths, ...high.paths };
  return {
    ...pluginsOf(low),
    ...pluginsOf(high),
    ...(Object.keys(paths).length === 0 ? {} : { paths }),
  };
}

export function layeredKnipConfig(nitpicker, layer) {
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
      ADDED_LISTS.map((key) => [key, [...listOf(nitpicker[key]), ...listOf(project[key])]]).filter(
        ([, values]) => values.length > 0,
      ),
    ),
    ...ignoredIssues(nitpicker.ignoreIssues, project.ignoreIssues),
    entry: [
      ...listOf(nitpicker.entry),
      ...listOf(project.entry).filter((item) => !isNegated(item)),
    ],
    project: [...listOf(nitpicker.project), ...listOf(project.project).filter(isNegated)],
    ...nestedWorkspaces(layer.config),
  };
}

export function writtenKnipConfig(config) {
  if (config.workspaces === undefined) {
    return config;
  }
  const root = { ...picked(config, WORKSPACE_KEYS), ...pluginsOf(config) };
  return { ...config, workspaces: { [ROOT_WORKSPACE]: root, ...config.workspaces } };
}
