import { productionPolicyConfig } from './base.mjs';

export default productionPolicyConfig({
  'nitpicker/no-managed-resource-construction-outside-composition-roots': 'error',
  'nitpicker/no-module-level-let': 'error',
});
