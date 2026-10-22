import { ACCUMULATOR_HINTS } from './accumulator.mjs';
import { LAZY_HINTS } from './lazy.mjs';
import { LOOP_IO_HINTS } from './loop-io.mjs';
import { SCOPE_HINTS } from './scopes.mjs';

export const EFFECT_HINTS = [...LOOP_IO_HINTS, ...ACCUMULATOR_HINTS, ...LAZY_HINTS, ...SCOPE_HINTS];
