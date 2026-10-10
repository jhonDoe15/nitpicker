import { BetaClient } from '../beta/beta-client.js';
import { internalValue } from '../beta/internal.js';
import { publicValue } from '../beta/public.js';
import { missingValue } from '../gamma/missing.js';

export const result = new BetaClient(publicValue, internalValue, missingValue);
