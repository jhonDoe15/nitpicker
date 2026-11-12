import { typescriptFeatureLayout } from '../../../languages/typescript/preset/coupling/feature-layout.mjs';
import { resolveLayoutFor } from '../../../languages/typescript/preset/layout.mjs';
import {
  acceptedFactSettings,
  CONFIG_FILE_NAME,
  FEATURE_LAYOUT_KEYS,
} from '../../../shared/config.mjs';
import { factRuleSettings } from '../../../shared/project-rules/fact-rules.mjs';
import { featureLayout, featureRoles } from '../../../shared/rules/features/feature-roles.mjs';
import { listed } from '../paths/hidden-code.mjs';

const TYPESCRIPT_LAYOUTS = new Set([undefined, 'typescript', 'javascript']);
const DEFAULT_PRESET = 'typescript';
const LISTED_FILES = 3;
const NOTHING = { loosened: [], changed: [] };

function effectiveLayout(config) {
  return TYPESCRIPT_LAYOUTS.has(config.preset)
    ? typescriptFeatureLayout(config.layout, resolveLayoutFor(config).sourceRoots)
    : featureLayout(config.layout);
}

function settingText(key, baseConfig, headConfig) {
  const [before, after] = [baseConfig, headConfig].map((config) => config.layout?.[key]);
  const shown = [before, after].map((value) =>
    value === undefined ? 'not set' : JSON.stringify(value),
  );
  return `layout.${key}: ${shown[0]} -> ${shown[1]}`;
}

function losesRole(before, after) {
  if (before.kind !== 'feature' && before.kind !== 'shared') {
    return false;
  }
  return (
    before.kind !== after.kind ||
    (after.kind === 'feature' && after.directory.length < before.directory.length)
  );
}

function joinsLargerFeature(before, after) {
  return (
    after.kind === 'feature' &&
    (before.kind !== 'feature' || after.directory.length < before.directory.length)
  );
}

function loosenings(headConfig) {
  const boundaries = factRuleSettings(headConfig.preset ?? DEFAULT_PRESET).includes(
    'layout.featureRoots',
  );
  const stability = acceptedFactSettings(headConfig).includes('layout.featureRoots');
  return [...(boundaries ? [losesRole] : []), ...(stability ? [joinsLargerFeature] : [])];
}

function filesLosingRoles(baseConfig, headConfig, scope) {
  const checks = loosenings(headConfig);
  if (checks.length === 0) {
    return [];
  }
  const baseRole = featureRoles(effectiveLayout(baseConfig));
  const headRole = featureRoles(effectiveLayout(headConfig));
  return scope.code
    .filter((file) => checks.some((loosens) => loosens(baseRole(file), headRole(file))))
    .toSorted();
}

export function featureLayoutChanges(baseConfig, headConfig, scope) {
  const keys = FEATURE_LAYOUT_KEYS.filter(
    (key) => JSON.stringify(baseConfig.layout?.[key]) !== JSON.stringify(headConfig.layout?.[key]),
  );
  if (keys.length === 0) {
    return NOTHING;
  }
  const setting = keys.map((key) => settingText(key, baseConfig, headConfig)).join('; ');
  const files = filesLosingRoles(baseConfig, headConfig, scope);
  if (files.length === 0) {
    return { loosened: [], changed: [setting] };
  }
  function describe(limit) {
    return `${setting} moves files out of the feature or shared folder they were in, or into a feature folder or a larger one: ${listed(files, limit)}`;
  }
  return {
    loosened: [
      { text: describe(LISTED_FILES), key: describe(files.length), files: [CONFIG_FILE_NAME] },
    ],
    changed: [],
  };
}
