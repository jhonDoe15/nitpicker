import { NEAR_DUPLICATE_BUILDERS } from '../near-duplicates/index.mjs';
import { DUPLICATE_BUILDERS } from './duplicates.mjs';
import { EDGE_BUILDERS } from './edges.mjs';
import { TEST_BUILDERS } from './tests.mjs';

export const DESIGN_BUILDERS = [
  ...DUPLICATE_BUILDERS,
  ...NEAR_DUPLICATE_BUILDERS,
  ...EDGE_BUILDERS,
  ...TEST_BUILDERS,
];
