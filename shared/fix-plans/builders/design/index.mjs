import { DUPLICATE_BUILDERS } from './duplicates.mjs';
import { EDGE_BUILDERS } from './edges.mjs';
import { TEST_BUILDERS } from './tests.mjs';

export const DESIGN_BUILDERS = [...DUPLICATE_BUILDERS, ...EDGE_BUILDERS, ...TEST_BUILDERS];
