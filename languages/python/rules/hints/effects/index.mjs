import { ACCUMULATOR_HINTS } from './accumulator.mjs';
import { LOOP_IO_HINTS } from './loop-io.mjs';

export const EFFECT_HINTS = [...LOOP_IO_HINTS, ...ACCUMULATOR_HINTS];
