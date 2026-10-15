import { productionPolicyConfig } from '../policies/base.mjs';

export const strictCompositionRootConfig = productionPolicyConfig({
  'nitpicker/no-branch-in-composition-root': 'error',
  'nitpicker/no-managed-resource-construction-outside-composition-roots': 'error',
  'nitpicker/no-module-level-let': 'error',
});
