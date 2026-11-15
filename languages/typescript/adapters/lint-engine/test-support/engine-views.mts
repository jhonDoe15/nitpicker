import {
  layerEntries as untypedLayerEntries,
  layeredPolicy as untypedLayeredPolicy,
  projectLayerValue as untypedProjectLayerValue,
} from '../project-layer.mjs';
import { projectEntries as untypedProjectEntries } from '../project-loader.mjs';
import { replacedOptionRules as untypedReplacedOptionRules } from '../project-rules.mjs';
import { replacedEslintOptions as untypedReplacedEslintOptions } from '../replaced-options.mjs';
import { applyRuleExceptions as untypedApplyRuleExceptions } from '../../../preset/eslint-config/exceptions.mjs';
import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadCheckoutFacts as untypedWithHeadCheckoutFacts,
} from '../../../preset/head-policy.mjs';
import type { Environment } from '../../../../../shared/processes/environment.mts';

export { PROJECT_LAYER_VARIABLE } from '../project-layer.mjs';

export type TestHeadPolicy = { readonly tools: { readonly eslint?: unknown } };

export type FlatEntry = Readonly<Record<string, unknown>>;

type LayerSettings = {
  readonly precedence?: readonly string[];
  readonly projectConfigFile?: string;
  readonly projectConfigMissing?: true;
};

export const projectLayerValue: (
  settings: LayerSettings | undefined,
  context: { readonly liveProjectRoot: string; readonly addsRules: boolean },
) => string = untypedProjectLayerValue;

export const layeredPolicy: (
  entries: readonly FlatEntry[],
  environment: Environment,
) => Promise<FlatEntry[]> = untypedLayeredPolicy;

export const layerEntries: (file: string) => Promise<FlatEntry[]> = untypedLayerEntries;

export const projectEntries: (file: string) => Promise<FlatEntry[]> = untypedProjectEntries;

export const replacedOptionRules: (
  policyEntries: readonly FlatEntry[],
  projectEntries: readonly FlatEntry[],
) => string[] = untypedReplacedOptionRules;

export const replacedEslintOptions: (
  config: { readonly tools: { readonly eslint: { readonly precedence: readonly string[] } } },
  projectRoot: string,
) => { readonly rules?: string[]; readonly error?: string } = untypedReplacedEslintOptions;

export const resolveHeadPolicy: (config: object, projectRoot?: string) => TestHeadPolicy =
  untypedResolveHeadPolicy;

export const withHeadCheckoutFacts: (
  policy: TestHeadPolicy,
  headPolicy: TestHeadPolicy,
) => TestHeadPolicy = untypedWithHeadCheckoutFacts;

export const applyRuleExceptions: (
  entries: readonly FlatEntry[],
  exceptions: unknown[],
  options: { readonly projectRules: boolean },
) => FlatEntry[] = untypedApplyRuleExceptions;
