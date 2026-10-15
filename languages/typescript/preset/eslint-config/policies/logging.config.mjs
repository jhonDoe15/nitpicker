import { productionPolicyConfig } from './base.mjs';

export default productionPolicyConfig({
  'nitpicker/no-production-console': 'error',
  'nitpicker/structured-catch-logging': 'error',
});
