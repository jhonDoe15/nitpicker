import { productionPolicyConfig } from './base.mjs';

// Strict rule set for "objects are constructed only in the composition root; no module-level let".
// The preset enables it; it is not part of the default ESLint config yet.
export default productionPolicyConfig({
  'nitpicker/no-managed-resource-construction-outside-composition-roots': 'error',
  'nitpicker/no-module-level-let': 'error',
});
