import { productionPolicyConfig } from './base.mjs';

// Strict rule set for "objects are constructed only in the composition root; no module-level let".
// The default ESLint config enables both rules (see strict.mjs and defaults/eslint.config.mjs);
// this standalone config lets the failure-message harness lint them on their own.
export default productionPolicyConfig({
  'nitpicker/no-managed-resource-construction-outside-composition-roots': 'error',
  'nitpicker/no-module-level-let': 'error',
});
