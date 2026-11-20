import path from 'node:path';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import {
  checkExceptionRules,
  RULE_EXCEPTION_ENTRY,
} from '../../preset/eslint-config/exceptions.mts';
import { ESLINT_PROJECT_FILES } from '../../preset/eslint-project/project-config.mts';
import { projectEntries } from './project-loader.mts';
import { ownedPolicy, withProjectSettings } from './project-rules.mts';
import { listField, recordField } from './typed/flat-config.mts';
import type { FlatEntry, OwnedPolicy, ProjectLayer } from './typed/flat-config.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';
import { fieldOf, hasField, parseJson, textOf } from '../../../../shared/values/readers.mts';

export const PROJECT_LAYER_VARIABLE = 'NITPICKER_DIFF_ESLINT_PROJECT_LAYER';

const NITPICKER_NAMESPACE = 'nitpicker';
const IGNORES = 'ignores';
const GLOBAL_IGNORE_KEYS = new Set(['name', IGNORES]);
const SCOPE_KEYS = ['name', 'files', IGNORES];

type LayerSettings = {
  readonly precedence?: readonly string[] | undefined;
  readonly projectConfigFile?: string | undefined;
  readonly projectConfigMissing?: true | undefined;
};

const missingConfigMessage: (tool: string, expected: string) => string = missingProjectConfig;

const precedenceOf: (precedence?: string[]) => {
  usesProject: boolean;
  nitpickerFirst: boolean;
} = precedenceLayers;

export function projectLayerValue(
  settings: LayerSettings | undefined,
  { liveProjectRoot, addsRules }: { readonly liveProjectRoot: string; readonly addsRules: boolean },
): string {
  const layers = precedenceOf(
    settings?.precedence === undefined ? undefined : [...settings.precedence],
  );
  if (layers.usesProject && settings?.projectConfigMissing === true) {
    throw new Error(
      missingConfigMessage(
        'eslint',
        `an ESLint flat config at the project root (${ESLINT_PROJECT_FILES.join(', ')})`,
      ),
    );
  }
  if (!layers.usesProject || settings?.projectConfigFile === undefined) {
    return '';
  }
  return JSON.stringify({
    config: path.join(liveProjectRoot, settings.projectConfigFile),
    nitpickerFirst: layers.nitpickerFirst,
    addsRules,
  });
}

export async function layeredPolicy(
  policyEntries: readonly FlatEntry[],
  environment: Environment,
): Promise<FlatEntry[]> {
  const layer = parsedLayer(environment[PROJECT_LAYER_VARIABLE]);
  const policy = policyEntries.filter((entry) => entry['name'] !== RULE_EXCEPTION_ENTRY);
  const exceptions = policyEntries.filter((entry) => entry['name'] === RULE_EXCEPTION_ENTRY);
  const ordered = layer === undefined ? policy : await withProjectLayer(policy, layer);
  checkExceptionRules(ordered, exceptions);
  return [...ordered, ...exceptions];
}

export async function layerEntries(file: string): Promise<FlatEntry[]> {
  return (await projectEntries(file)).map((entry) => withoutBasePath(entry, path.dirname(file)));
}

async function withProjectLayer(
  policy: readonly FlatEntry[],
  layer: ProjectLayer,
): Promise<FlatEntry[]> {
  const project = await layerEntries(layer.config);
  const owned = ownedPolicy(policy);
  const applied = project.flatMap((entry) => appliedEntry(entry, owned, layer));
  return layer.nitpickerFirst
    ? [...applied, ...policy]
    : [...withProjectSettings(policy, project), ...applied];
}

function parsedLayer(value: string | undefined): ProjectLayer | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  const parsed = parseJson(value);
  return {
    config: textOf(fieldOf(parsed, 'config')),
    nitpickerFirst: fieldOf(parsed, 'nitpickerFirst') === true,
    addsRules: fieldOf(parsed, 'addsRules') === true,
  };
}

function underBase(base: string, pattern: unknown): unknown {
  if (typeof pattern !== 'string') {
    return pattern;
  }
  return pattern.startsWith('!')
    ? `!${path.posix.join(base, pattern.slice(1))}`
    : path.posix.join(base, pattern);
}

function withoutBasePath(entry: FlatEntry, configDirectory: string): FlatEntry {
  const basePath = entry['basePath'];
  if (basePath === undefined) {
    return entry;
  }
  const rest = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'basePath'));
  const base = path
    .relative(configDirectory, path.resolve(configDirectory, textOf(basePath)))
    .split(path.sep)
    .join('/');
  if (base === '') {
    return rest;
  }
  const files = listField(rest, 'files')?.map((pattern) =>
    Array.isArray(pattern)
      ? pattern.map((part) => underBase(base, part))
      : underBase(base, pattern),
  );
  const ignores = listField(rest, IGNORES);
  return {
    ...rest,
    ...(files !== undefined || isGlobalIgnores(rest) ? {} : { files: [`${base}/**`] }),
    ...(files === undefined ? {} : { files }),
    ...(ignores === undefined
      ? {}
      : { ignores: ignores.map((pattern) => underBase(base, pattern)) }),
  };
}

function isGlobalIgnores(entry: FlatEntry): boolean {
  return (
    Array.isArray(entry[IGNORES]) && Object.keys(entry).every((key) => GLOBAL_IGNORE_KEYS.has(key))
  );
}

function addedIgnores(entry: FlatEntry): FlatEntry[] {
  const ignores = (listField(entry, IGNORES) ?? []).filter(
    (pattern) => typeof pattern !== 'string' || !pattern.startsWith('!'),
  );
  return ignores.length === 0 ? [] : [{ ...entry, ignores }];
}

function appliedEntry(entry: FlatEntry, owned: OwnedPolicy, layer: ProjectLayer): FlatEntry[] {
  if (isGlobalIgnores(entry)) {
    return addedIgnores(entry);
  }
  const effects = Object.entries({
    plugins: layer.addsRules
      ? unowned(recordField(entry, 'plugins'), (name) => owned.plugins.has(name))
      : {},
    languageOptions:
      fieldOf(recordField(entry, 'languageOptions'), 'globals') === undefined
        ? {}
        : { globals: fieldOf(recordField(entry, 'languageOptions'), 'globals') },
    settings: unowned(recordField(entry, 'settings'), (key) => isOwnedSetting(key, owned)),
    rules: layer.addsRules ? addedRules(recordField(entry, 'rules') ?? {}, owned) : {},
  }).filter(([, value]) => Object.keys(value).length > 0);
  if (effects.length === 0) {
    return [];
  }
  const scope = SCOPE_KEYS.filter((key) => hasField(entry, key)).map((key): [string, unknown] => [
    key,
    entry[key],
  ]);
  return [Object.fromEntries([...scope, ...effects])];
}

function unowned(
  values: Readonly<Record<string, unknown>> | undefined,
  isOwned: (key: string) => boolean,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => !isOwned(key)));
}

function isOwnedSetting(key: string, owned: OwnedPolicy): boolean {
  const namespace = key.split('/')[0] ?? key;
  return (
    owned.settings.has(key) ||
    key.startsWith(NITPICKER_NAMESPACE) ||
    owned.plugins.has(key) ||
    owned.plugins.has(namespace)
  );
}

function namespaceOf(ruleId: string): string {
  const separator = ruleId.lastIndexOf('/');
  return separator === -1 ? '' : ruleId.slice(0, separator);
}

function addedRules(
  rules: Readonly<Record<string, unknown>>,
  owned: OwnedPolicy,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rules).filter(
      ([ruleId]) => !owned.enabled.has(ruleId) && namespaceOf(ruleId) !== NITPICKER_NAMESPACE,
    ),
  );
}
