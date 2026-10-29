import path from 'node:path';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import {
  checkExceptionRules,
  RULE_EXCEPTION_ENTRY,
} from '../../preset/eslint-config/exceptions.mjs';
import { ESLINT_PROJECT_FILES } from '../../preset/eslint-project/project-config.mjs';
import { projectEntries } from './project-loader.mjs';
import { ownedPolicy, withProjectSettings } from './project-rules.mjs';

export const PROJECT_LAYER_VARIABLE = 'NITPICKER_DIFF_ESLINT_PROJECT_LAYER';

const NITPICKER_NAMESPACE = 'nitpicker';
const GLOBAL_IGNORE_KEYS = new Set(['name', 'ignores']);
const SCOPE_KEYS = ['name', 'files', 'ignores'];

export function projectLayerValue(settings, { liveProjectRoot, addsRules }) {
  const layers = precedenceLayers(settings?.precedence);
  if (layers.usesProject && settings.projectConfigMissing === true) {
    throw new Error(
      missingProjectConfig(
        'eslint',
        `an ESLint flat config at the project root (${ESLINT_PROJECT_FILES.join(', ')})`,
      ),
    );
  }
  if (!layers.usesProject || settings.projectConfigFile === undefined) {
    return '';
  }
  return JSON.stringify({
    config: path.join(liveProjectRoot, settings.projectConfigFile),
    nitpickerFirst: layers.nitpickerFirst,
    addsRules,
  });
}

export async function layeredPolicy(policyEntries, environment) {
  const layer = parsedLayer(environment[PROJECT_LAYER_VARIABLE]);
  const policy = policyEntries.filter((entry) => entry?.name !== RULE_EXCEPTION_ENTRY);
  const exceptions = policyEntries.filter((entry) => entry?.name === RULE_EXCEPTION_ENTRY);
  const ordered = layer === undefined ? policy : await withProjectLayer(policy, layer);
  checkExceptionRules(ordered, exceptions);
  return [...ordered, ...exceptions];
}

export async function layerEntries(file) {
  return (await projectEntries(file)).map((entry) => withoutBasePath(entry, path.dirname(file)));
}

async function withProjectLayer(policy, layer) {
  const project = await layerEntries(layer.config);
  const owned = ownedPolicy(policy);
  const applied = project.flatMap((entry) => appliedEntry(entry, owned, layer));
  return layer.nitpickerFirst
    ? [...applied, ...policy]
    : [...withProjectSettings(policy, project), ...applied];
}

function parsedLayer(value) {
  return value === undefined || value.length === 0 ? undefined : JSON.parse(value);
}

function underBase(base, pattern) {
  if (typeof pattern !== 'string') {
    return pattern;
  }
  return pattern.startsWith('!')
    ? `!${path.posix.join(base, pattern.slice(1))}`
    : path.posix.join(base, pattern);
}

function withoutBasePath(entry, configDirectory) {
  if (entry.basePath === undefined) {
    return entry;
  }
  const { basePath, ...rest } = entry;
  const base = path
    .relative(configDirectory, path.resolve(configDirectory, basePath))
    .split(path.sep)
    .join('/');
  if (base === '') {
    return rest;
  }
  const files = rest.files?.map((pattern) =>
    Array.isArray(pattern)
      ? pattern.map((part) => underBase(base, part))
      : underBase(base, pattern),
  );
  return {
    ...rest,
    ...(files !== undefined || isGlobalIgnores(rest) ? {} : { files: [`${base}/**`] }),
    ...(files === undefined ? {} : { files }),
    ...(rest.ignores === undefined
      ? {}
      : { ignores: rest.ignores.map((pattern) => underBase(base, pattern)) }),
  };
}

function isGlobalIgnores(entry) {
  return (
    Array.isArray(entry.ignores) && Object.keys(entry).every((key) => GLOBAL_IGNORE_KEYS.has(key))
  );
}

function addedIgnores(entry) {
  const ignores = entry.ignores.filter(
    (pattern) => typeof pattern !== 'string' || !pattern.startsWith('!'),
  );
  return ignores.length === 0 ? [] : [{ ...entry, ignores }];
}

function appliedEntry(entry, owned, layer) {
  if (isGlobalIgnores(entry)) {
    return addedIgnores(entry);
  }
  const effects = Object.entries({
    plugins: layer.addsRules ? unowned(entry.plugins, (name) => owned.plugins.has(name)) : {},
    languageOptions:
      entry.languageOptions?.globals === undefined
        ? {}
        : { globals: entry.languageOptions.globals },
    settings: unowned(entry.settings, (key) => isOwnedSetting(key, owned)),
    rules: layer.addsRules ? addedRules(entry.rules ?? {}, owned) : {},
  }).filter(([, value]) => Object.keys(value).length > 0);
  if (effects.length === 0) {
    return [];
  }
  const scope = SCOPE_KEYS.filter((key) => entry[key] !== undefined).map((key) => [
    key,
    entry[key],
  ]);
  return [Object.fromEntries([...scope, ...effects])];
}

function unowned(values, isOwned) {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => !isOwned(key)));
}

function isOwnedSetting(key, owned) {
  const namespace = key.split('/')[0];
  return (
    owned.settings.has(key) ||
    key.startsWith(NITPICKER_NAMESPACE) ||
    owned.plugins.has(key) ||
    owned.plugins.has(namespace)
  );
}

function namespaceOf(ruleId) {
  const separator = ruleId.lastIndexOf('/');
  return separator === -1 ? '' : ruleId.slice(0, separator);
}

function addedRules(rules, owned) {
  return Object.fromEntries(
    Object.entries(rules).filter(
      ([ruleId]) => !owned.enabled.has(ruleId) && namespaceOf(ruleId) !== NITPICKER_NAMESPACE,
    ),
  );
}
