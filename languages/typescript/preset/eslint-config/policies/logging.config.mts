import { productionPolicyConfig } from './base.mts';

export default productionPolicyConfig(
  {
    'nitpicker/no-production-console': 'error',
    'nitpicker/structured-catch-logging': 'error',
  },
  { 'nitpicker/no-production-console': ['error', { allowStandardStreams: true }] },
);
