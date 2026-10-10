import type { Tier } from '../../members/index.js';

const CAP_DAYS = 20;

export type FineInput = {
  readonly dailyRateCents: number;
  readonly daysLate: number;
  readonly tier: Tier;
};

export function fineCents(input: FineInput): number {
  const fullFine = Math.min(input.daysLate, CAP_DAYS) * input.dailyRateCents;
  if (input.tier === 'student') {
    return Math.floor(fullFine / 2);
  }
  return fullFine;
}
