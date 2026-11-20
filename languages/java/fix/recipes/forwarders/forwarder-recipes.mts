import type { FixRecipe } from '../../../../../core/fix/typed/fix-types.mts';
import { planForwarders, type ForwarderRecipe } from './forwarder-plan.mts';

function forwarderRecipe(id: string, spec: ForwarderRecipe): FixRecipe {
  return {
    id,
    rules: [{ tool: 'pmd', rule: spec.rule }],
    presets: ['java'],
    scope: 'project',
    safety: 'review',
    plan: (input) => planForwarders(spec, input),
  };
}

export const staticForwardingWrapperRecipe = forwarderRecipe('java-static-forwarding-wrapper', {
  kind: 'wrapper',
  rule: 'StaticForwardingWrapper',
});

export const compatibilityShimRecipe = forwarderRecipe('java-compatibility-shim', {
  kind: 'shim',
  rule: 'CompatibilityShim',
});
