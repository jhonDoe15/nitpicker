import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { resolveLayoutFor } from '../types/typed-views.mts';
import {
  acceptedFactSettings,
  factRuleSettings,
  FEATURE_LAYOUT_KEYS,
  featureLayout,
  featureRoles,
  typescriptFeatureLayout,
} from '../types/config-views.mts';
import type { FeatureRole } from '../types/config-views.mts';
import type { ChangePart, PolicyConfig, PolicyScope } from '../types/policy-types.mts';
import { listed } from '../paths/hidden-code.mts';

const TYPESCRIPT_LAYOUTS = new Set<string | undefined>([undefined, 'typescript', 'javascript']);
const DEFAULT_PRESET = 'typescript';
const LISTED_FILES = 3;
const NOTHING: ChangePart = { loosened: [], changed: [] };

function effectiveLayout(config: PolicyConfig) {
  return TYPESCRIPT_LAYOUTS.has(config.preset)
    ? typescriptFeatureLayout(config.layout, resolveLayoutFor(config).sourceRoots)
    : featureLayout(config.layout);
}

function settingText(key: string, baseConfig: PolicyConfig, headConfig: PolicyConfig): string {
  const [before, after] = [baseConfig, headConfig].map((config) => config.layout?.[key]);
  const shown = [before, after].map((value) =>
    value === undefined ? 'not set' : JSON.stringify(value),
  );
  return `layout.${key}: ${shown.join(' -> ')}`;
}

function losesRole(before: FeatureRole, after: FeatureRole): boolean {
  if (before.kind !== 'feature' && before.kind !== 'shared') {
    return false;
  }
  return (
    before.kind !== after.kind ||
    (after.kind === 'feature' &&
      before.kind === 'feature' &&
      after.directory.length < before.directory.length)
  );
}

function joinsLargerFeature(before: FeatureRole, after: FeatureRole): boolean {
  return (
    after.kind === 'feature' &&
    (before.kind !== 'feature' || after.directory.length < before.directory.length)
  );
}

function loosenings(headConfig: PolicyConfig) {
  const boundaries = factRuleSettings(headConfig.preset ?? DEFAULT_PRESET).includes(
    'layout.featureRoots',
  );
  const stability = acceptedFactSettings(headConfig).includes('layout.featureRoots');
  return [...(boundaries ? [losesRole] : []), ...(stability ? [joinsLargerFeature] : [])];
}

function filesLosingRoles(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): string[] {
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

export function featureLayoutChanges(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): ChangePart {
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
  function describe(limit: number): string {
    return `${setting} moves files out of the feature or shared folder they were in, or into a feature folder or a larger one: ${listed(files, limit)}`;
  }
  return {
    loosened: [
      { text: describe(LISTED_FILES), key: describe(files.length), files: [CONFIG_FILE_NAME] },
    ],
    changed: [],
  };
}
