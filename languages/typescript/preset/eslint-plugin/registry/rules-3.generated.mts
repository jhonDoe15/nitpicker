import { rule as ruleRequireTestProcessTimeout } from '../rules/test-runtime/processes/timeouts/require-test-process-timeout.mts';
import { rule as ruleReusableObjectPerCall } from '../rules/reuse/reusable-object-per-call.mts';
import { rule as ruleSettlePendingOnClose } from '../rules/lifecycles/pending/settle-pending-on-close.mts';
import { rule as ruleShorterBooleanLogic } from '../rules/control/shorter-boolean-logic.mts';
import { rule as ruleSimplerBooleanLogic } from '../rules/control/simpler-boolean-logic.mts';
import { rule as ruleStrictBooleanExpressions } from '../rules/wrapped/strict-boolean-expressions.mts';
import { rule as ruleStructuredCatchLogging } from '../rules/errors/structured-catch-logging.mts';
import { rule as ruleTestMustUseProductionRuntime } from '../rules/test-runtime/assertions/test-must-use-production-runtime.mts';
import { rule as ruleTestTsconfigPinsLibAndTypes } from '../rules/test-runtime/types/test-tsconfig-pins-lib-and-types.mts';
import { rule as ruleTimeUnitMismatch } from '../rules/time/units/time-unit-mismatch.mts';
import { rule as ruleTimeoutAbandonsOperation } from '../rules/async/timeout-abandons-operation.mts';
import { rule as ruleUnboundedFanOut } from '../rules/concurrency/unbounded-fan-out.mts';
import { rule as ruleUnboundedReactiveFanOut } from '../rules/concurrency/reactive/unbounded-reactive-fan-out.mts';
import { rule as ruleUntestedRoundTrip } from '../rules/round-trips/untested-round-trip.mts';

export const partRules = {
  'require-test-process-timeout': ruleRequireTestProcessTimeout,
  'reusable-object-per-call': ruleReusableObjectPerCall,
  'settle-pending-on-close': ruleSettlePendingOnClose,
  'shorter-boolean-logic': ruleShorterBooleanLogic,
  'simpler-boolean-logic': ruleSimplerBooleanLogic,
  'strict-boolean-expressions': ruleStrictBooleanExpressions,
  'structured-catch-logging': ruleStructuredCatchLogging,
  'test-must-use-production-runtime': ruleTestMustUseProductionRuntime,
  'test-tsconfig-pins-lib-and-types': ruleTestTsconfigPinsLibAndTypes,
  'time-unit-mismatch': ruleTimeUnitMismatch,
  'timeout-abandons-operation': ruleTimeoutAbandonsOperation,
  'unbounded-fan-out': ruleUnboundedFanOut,
  'unbounded-reactive-fan-out': ruleUnboundedReactiveFanOut,
  'untested-round-trip': ruleUntestedRoundTrip,
};
