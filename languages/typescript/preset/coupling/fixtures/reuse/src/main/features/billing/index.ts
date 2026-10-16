import type { Price } from '../../shared/price';
import { id } from '../../shared/ids';
import { clock } from '../../shared/clock';

export type Total = Price;
export const billingId = id;
export const billingClock = clock;
