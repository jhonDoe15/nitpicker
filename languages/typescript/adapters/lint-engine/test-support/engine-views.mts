import {
  layeredPolicy as untypedLayeredPolicy,
  projectLayerValue as untypedProjectLayerValue,
} from '../project-layer.mts';
import { projectEntries as untypedProjectEntries } from '../project-loader.mts';
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

export const projectEntries: (file: string) => Promise<FlatEntry[]> = untypedProjectEntries;

export { resolveHeadPolicy, withHeadCheckoutFacts } from '../../../preset/head-policy.mts';

export { applyRuleExceptions } from '../../../preset/eslint-config/exceptions.mts';
