import {
  acceptedFactSettings as untypedAcceptedFactSettings,
  FEATURE_LAYOUT_KEYS as UNTYPED_FEATURE_LAYOUT_KEYS,
  sameJson as untypedSameJson,
  shownSetting as untypedShownSetting,
} from '../../../shared/config.mjs';
import { factRuleSettings as untypedFactRuleSettings } from '../../../shared/project-rules/fact-rules.mjs';
import {
  featureLayout as untypedFeatureLayout,
  featureRoles as untypedFeatureRoles,
} from '../../../shared/rules/features/feature-roles.mjs';
import { typescriptFeatureLayout as untypedTypescriptFeatureLayout } from '../../../languages/typescript/preset/coupling/feature-layout.mjs';
import {
  DEFAULT_CRAP_SCORE_LIMIT as UNTYPED_DEFAULT_CRAP_SCORE_LIMIT,
  FILE_LIMIT_DEFAULTS as UNTYPED_FILE_LIMIT_DEFAULTS,
  TEST_TIME_DEFAULTS as UNTYPED_TEST_TIME_DEFAULTS,
} from '../../../shared/policy.mjs';
import {
  resolveTestTimeouts as untypedResolveTestTimeouts,
  TEST_TIMEOUT_LANGUAGES as UNTYPED_TEST_TIMEOUT_LANGUAGES,
  TIMEOUT_LIMIT_KEYS as UNTYPED_TIMEOUT_LIMIT_KEYS,
  validateTestTimeouts as untypedValidateTestTimeouts,
} from '../../../shared/test-timeouts/resolve.mjs';
import { withoutTroubleshooting as untypedWithoutTroubleshooting } from '../../../shared/messages/troubleshooting.mjs';
import type { LayoutConfig, PolicyConfig } from './policy-types.mts';
import { isPlainObject } from '../../../shared/values/readers.mts';

export type TimeoutLimits = Readonly<Record<string, number | undefined>>;

export type FeatureRole =
  | { readonly kind: 'shared' }
  | { readonly kind: 'other' }
  | { readonly kind: 'feature'; readonly directory: string };

type FeatureLayout = {
  readonly sharedRoots: readonly string[];
  readonly featureRoots: readonly string[];
  readonly sharedInsideFeatures: boolean;
  readonly notFeatures: readonly string[];
  readonly notFeatureFolders: readonly string[];
  readonly aliases: Readonly<Record<string, string>>;
};

type RoleLayout = Pick<FeatureLayout, 'sharedRoots' | 'featureRoots'> & {
  readonly sharedInsideFeatures: boolean;
};

const FEATURE_LAYOUT_KEYS: readonly string[] = UNTYPED_FEATURE_LAYOUT_KEYS;
const sameJson: (left: unknown, right: unknown) => boolean = untypedSameJson;
const shownSetting: (value: unknown) => string = untypedShownSetting;
const acceptedFactSettings: (config: PolicyConfig) => readonly string[] =
  untypedAcceptedFactSettings;
const factRuleSettings: (language: string) => readonly string[] = untypedFactRuleSettings;
const featureLayout: (layout: LayoutConfig | undefined) => FeatureLayout = untypedFeatureLayout;
const rolesOf: (layout: RoleLayout) => (file: string) => {
  readonly kind: string;
  readonly directory?: string;
} = untypedFeatureRoles;

function featureRoles(layout: RoleLayout): (file: string) => FeatureRole {
  const roleOf = rolesOf(layout);
  return (file) => {
    const role = roleOf(file);
    if (role.kind === 'feature') {
      return { kind: 'feature', directory: role.directory ?? '' };
    }
    return role.kind === 'shared' ? { kind: 'shared' } : { kind: 'other' };
  };
}
const typescriptFeatureLayout: (
  layout: LayoutConfig | undefined,
  sourceRoots: readonly string[],
) => RoleLayout = untypedTypescriptFeatureLayout;
const TEST_TIMEOUT_LANGUAGES: readonly string[] = UNTYPED_TEST_TIMEOUT_LANGUAGES;
const TIMEOUT_LIMIT_KEYS: readonly string[] = UNTYPED_TIMEOUT_LIMIT_KEYS;
const validateTestTimeouts: (settings: unknown) => void = untypedValidateTestTimeouts;
const resolveTestTimeouts: (
  config: PolicyConfig,
  context: { readonly language: string | undefined; readonly project?: string },
) => TimeoutLimits = untypedResolveTestTimeouts;
const withoutTroubleshooting: (message: string) => string = untypedWithoutTroubleshooting;
const THRESHOLD_DEFAULTS: Readonly<Record<string, number>> = {
  crapLimit: UNTYPED_DEFAULT_CRAP_SCORE_LIMIT,
  ...UNTYPED_FILE_LIMIT_DEFAULTS,
  ...UNTYPED_TEST_TIME_DEFAULTS,
};

export {
  acceptedFactSettings,
  factRuleSettings,
  FEATURE_LAYOUT_KEYS,
  featureLayout,
  featureRoles,
  isPlainObject,
  sameJson,
  shownSetting,
  resolveTestTimeouts,
  TEST_TIMEOUT_LANGUAGES,
  THRESHOLD_DEFAULTS,
  TIMEOUT_LIMIT_KEYS,
  typescriptFeatureLayout,
  validateTestTimeouts,
  withoutTroubleshooting,
};
