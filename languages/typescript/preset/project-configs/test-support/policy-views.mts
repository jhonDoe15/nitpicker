import { validateConfig as untypedValidateConfig } from '../../../../../core/configuration/validate.mts';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../tool-configs.mjs';
import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadCheckoutFacts as untypedWithHeadCheckoutFacts,
} from '../../head-policy.mjs';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../../layout.mjs';
import { layeredStrykerConfig as untypedLayeredStrykerConfig } from '../stryker-project-config.mjs';

export type ToolSettings = {
  precedence?: string[];
  projectConfigError?: string;
  projectConfig?: {
    runner?: string;
    retry?: unknown;
    compilerOptions?: Record<string, unknown>;
  };
} & Record<string, unknown>;

export type StrykerConfig = {
  mutator?: { excludedMutations?: string[] };
  concurrency?: number;
} & Record<string, unknown>;

export type Policy = {
  tools: { stryker: ToolSettings; typescript: ToolSettings; tests: ToolSettings };
} & Record<string, unknown>;

export const resolveHeadPolicy: (config: Record<string, unknown>, projectRoot?: string) => Policy =
  untypedResolveHeadPolicy;

export const withHeadCheckoutFacts: (
  policy: Record<string, unknown>,
  head?: { tools?: Partial<Policy['tools']> },
) => Policy = untypedWithHeadCheckoutFacts;

export const resolveLayoutFor: (policy: Policy) => unknown = untypedResolveLayoutFor;

export function layoutTransformFor(
  name: string,
  layout: unknown,
): (text: string, target: string) => string {
  const transform: ((text: string, target: string) => string) | undefined =
    untypedLayoutTransformFor(name, layout);
  if (transform === undefined) {
    throw new Error(`no layout transform for ${name}`);
  }
  return transform;
}

export const layeredStrykerConfig: (
  config: StrykerConfig,
  settings?: ToolSettings,
) => StrykerConfig = untypedLayeredStrykerConfig;

export const validateConfig: (config: Record<string, unknown>) => unknown = untypedValidateConfig;
