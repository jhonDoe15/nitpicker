import { rule as ruleTimeoutAbandonsOperation } from '../rules/async/timeout-abandons-operation.mts';
import { rule as ruleUnboundedFanOut } from '../rules/concurrency/unbounded-fan-out.mts';
import { rule as ruleUnboundedReactiveFanOut } from '../rules/concurrency/reactive/unbounded-reactive-fan-out.mts';
import { rule as ruleUntestedRoundTrip } from '../rules/round-trips/untested-round-trip.mts';

export const partRules = {
  'timeout-abandons-operation': ruleTimeoutAbandonsOperation,
  'unbounded-fan-out': ruleUnboundedFanOut,
  'unbounded-reactive-fan-out': ruleUnboundedReactiveFanOut,
  'untested-round-trip': ruleUntestedRoundTrip,
};
