import {
  layerEntries as untypedLayerEntries,
  layeredPolicy as untypedLayeredPolicy,
  projectLayerValue as untypedProjectLayerValue,
} from '../project-layer.mts';
import { projectEntries as untypedProjectEntries } from '../project-loader.mts';
import { replacedOptionRules as untypedReplacedOptionRules } from '../project-rules.mts';
import { replacedEslintOptions as untypedReplacedEslintOptions } from '../replaced-options.mts';
import type { FlatEntry } from '../typed/flat-config.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';

export { PROJECT_LAYER_VARIABLE } from '../project-layer.mts';

export type { FlatEntry };

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

export { resolveHeadPolicy, withHeadCheckoutFacts } from '../../../preset/head-policy.mts';

export { applyRuleExceptions } from '../../../preset/eslint-config/exceptions.mts';
