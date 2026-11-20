import { validateConfig } from '../../../../../core/configuration/validate.mts';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../tool-configs.mts';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../../head-policy.mts';
import { resolveLayoutFor } from '../../layout.mts';
import { layeredStrykerConfig } from '../stryker-project-config.mts';
import type { HeadPolicyFile, ToolSettings } from '../../typed/head-policy-types.mts';

export type Policy = HeadPolicyFile;
export type { ToolSettings };

export function layoutTransformFor(
  name: string,
  layout: Parameters<typeof untypedLayoutTransformFor>[1],
): (text: string, target: string) => string {
  const transform = untypedLayoutTransformFor(name, layout);
  if (transform === undefined) {
    throw new Error(`no layout transform for ${name}`);
  }
  return transform;
}

export {
  layeredStrykerConfig,
  resolveHeadPolicy,
  resolveLayoutFor,
  validateConfig,
  withHeadCheckoutFacts,
};
