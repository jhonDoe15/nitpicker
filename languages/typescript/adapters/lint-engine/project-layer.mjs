import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'eslint/config';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { RULE_EXCEPTION_ENTRY } from '../../preset/eslint-config/exceptions.mjs';
import { ESLINT_PROJECT_FILES } from '../../preset/eslint-project/project-config.mjs';

export const PROJECT_LAYER_VARIABLE = 'NITPICKER_DIFF_ESLINT_PROJECT_LAYER';

const NITPICKER_NAMESPACE = 'nitpicker';
const TYPESCRIPT_CONFIG = /\.[cm]?ts$/u;
const GLOBAL_IGNORE_KEYS = new Set(['name', 'basePath', 'ignores']);
const SCOPE_KEYS = ['name', 'basePath', 'files', 'ignores'];
const OFF_SEVERITIES = new Set([0, '0', 'off']);

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
  if (layer === undefined) {
    return policyEntries;
  }
  const owned = ownedNames(policyEntries);
  const applied = (await projectEntries(layer.config)).flatMap((entry) =>
    appliedEntry(entry, owned, layer),
  );
  const policy = policyEntries.filter((entry) => entry?.name !== RULE_EXCEPTION_ENTRY);
  const exceptions = policyEntries.filter((entry) => entry?.name === RULE_EXCEPTION_ENTRY);
  const ordered = layer.nitpickerFirst ? [...applied, ...policy] : [...policy, ...applied];
  return [...ordered, ...exceptions];
}

function parsedLayer(value) {
  return value === undefined || value.length === 0 ? undefined : JSON.parse(value);
}

function ownedNames(entries) {
  return {
    rules: new Set(entries.flatMap((entry) => Object.keys(entry?.rules ?? {}))),
    plugins: new Set(entries.flatMap((entry) => Object.keys(entry?.plugins ?? {}))),
  };
}

async function described(message, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

async function projectEntries(file) {
  const label = `ESLint config ${path.basename(file)}`;
  const exported = await described(`${label} could not be loaded`, () => loadedConfig(file));
  if (typeof exported !== 'object' || exported === null) {
    throw new TypeError(`${label} must export a flat config array or object`);
  }
  return described(`${label} is not a valid flat config`, () => defineConfig(exported));
}

async function loadedConfig(file) {
  const url = pathToFileURL(file).href;
  if (!TYPESCRIPT_CONFIG.test(file)) {
    const loaded = await import(url);
    return loaded.default;
  }
  const loaded = await typescriptLoader(file).import(url);
  return loaded?.default ?? loaded;
}

function typescriptLoader(file) {
  const attempts = [file, import.meta.filename].map(jitiFrom);
  const found = attempts.find(({ loader }) => loader !== undefined);
  if (found === undefined) {
    throw new Error(
      "the 'jiti' library is required for loading TypeScript configuration files; install it in the project, as ESLint itself needs",
      { cause: attempts[0].error },
    );
  }
  return found.loader.createJiti(file, { moduleCache: false });
}

function jitiFrom(file) {
  try {
    return { loader: createRequire(file)('jiti') };
  } catch (error) {
    return { error };
  }
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
    plugins: layer.addsRules ? unownedPlugins(entry.plugins, owned) : {},
    languageOptions:
      entry.languageOptions?.globals === undefined
        ? {}
        : { globals: entry.languageOptions.globals },
    settings: entry.settings ?? {},
    rules: appliedRules(entry.rules ?? {}, owned, layer),
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

function unownedPlugins(plugins, owned) {
  return Object.fromEntries(
    Object.entries(plugins ?? {}).filter(([name]) => !owned.plugins.has(name)),
  );
}

function namespaceOf(ruleId) {
  const separator = ruleId.lastIndexOf('/');
  return separator === -1 ? '' : ruleId.slice(0, separator);
}

function isOff(setting) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  return OFF_SEVERITIES.has(typeof severity === 'string' ? severity.toLowerCase() : severity);
}

function appliedRules(rules, owned, layer) {
  return Object.fromEntries(
    Object.entries(rules).filter(([ruleId, setting]) =>
      owned.rules.has(ruleId)
        ? !layer.nitpickerFirst && !isOff(setting)
        : layer.addsRules && namespaceOf(ruleId) !== NITPICKER_NAMESPACE,
    ),
  );
}
