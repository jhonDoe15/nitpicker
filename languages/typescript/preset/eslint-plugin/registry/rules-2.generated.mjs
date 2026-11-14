import { rule as ruleNoUnhandledVoidPromise } from '../rules/promises/no-unhandled-void-promise.mjs';
import { rule as ruleNoUnindexedForeignKey } from '../rules/foreign-keys/no-unindexed-foreign-key.mjs';
import { rule as ruleNoUninjectableDelay } from '../rules/testing/lifecycle/no-uninjectable-delay.mjs';
import { rule as ruleNoUnknownInDomain } from '../rules/boundaries/no-unknown-in-domain.mjs';
import { rule as ruleNoUnknownMainFolder } from '../rules/guards/no-unknown-main-folder.mjs';
import { rule as ruleNoUnmappedException } from '../rules/errors/unmapped/no-unmapped-exception.mjs';
import { rule as ruleNoUnorderedQuery } from '../rules/queries/order/no-unordered-query.mjs';
import { rule as ruleNoUnownedAsyncAssertion } from '../test-assertions/unowned-async/no-unowned-async-assertion.mjs';
import { rule as ruleNoUnsafeDeserialization } from '../rules/security/deserialization/no-unsafe-deserialization.mjs';
import { rule as ruleNoUnsafePathJoin } from '../rules/guards/no-unsafe-path-join.mjs';
import { rule as ruleNoUnusedDomEnvironment } from '../rules/testing/environment/no-unused-dom-environment.mjs';
import { rule as ruleNoUnvalidatedSchemaField } from '../rules/boundaries/no-unvalidated-schema-field.mjs';
import { rule as ruleNoWaitForWithFakeTimers } from '../rules/testing/assertions/no-wait-for-with-fake-timers.mjs';
import { rule as ruleNoWastedCollectionStep } from '../rules/collections/pipelines/no-wasted-collection-step.mjs';
import { rule as ruleNoWeakAssertion } from '../test-assertions/weak-assertion/no-weak-assertion.mjs';
import { rule as ruleNoWeakHash } from '../rules/security/hash/no-weak-hash.mjs';
import { rule as rulePreserveErrorCause } from '../rules/errors/preserve-error-cause.mjs';
import { rule as rulePromiseWaitDeadline } from '../rules/promises/executors/promise-wait-deadline.mjs';
import { rule as ruleReactControlledInput } from '../rules/react/forms/react-controlled-input.mjs';
import { rule as ruleReactFieldHasLabel } from '../rules/react/forms/react-field-has-label.mjs';
import { rule as ruleReactNoDirectDom } from '../rules/react/render/react-no-direct-dom.mjs';
import { rule as ruleReactNoEffectDataFetching } from '../rules/react/react-no-effect-data-fetching.mjs';
import { rule as ruleReactNoEffectDerivedState } from '../rules/react/react-no-effect-derived-state.mjs';
import { rule as ruleReactNoEffectEventHandling } from '../rules/react/render/react-no-effect-event-handling.mjs';
import { rule as ruleReactNoHardcodedColors } from '../rules/react/theme/react-no-hardcoded-colors.mjs';
import { rule as ruleReactNoRandomKey } from '../rules/react/render/react-no-random-key.mjs';
import { rule as ruleReactSingleStylingApproach } from '../rules/react/react-single-styling-approach.mjs';
import { rule as ruleReactTestNoImplementationDetails } from '../rules/react-tests/react-test-no-implementation-details.mjs';
import { rule as ruleReleaseListenersOnClose } from '../rules/lifecycles/handles/release-listeners-on-close.mjs';
import { rule as ruleReportModuleLoadEffects } from '../rules/modules/report-module-load-effects.mjs';
import { rule as ruleRequireAtomicUpdates } from '../rules/wrapped/require-atomic-updates.mjs';
import { rule as ruleRequireClientTimeout } from '../rules/clients/require-client-timeout.mjs';
import { rule as ruleRequireErrorListener } from '../rules/events/require-error-listener.mjs';
import { rule as ruleRequireHttpTimeout } from '../rules/security/http/require-http-timeout.mjs';
import { rule as ruleRequireProcessTimeout } from '../rules/processes/require-process-timeout.mjs';
import { rule as ruleRequirePromiseReject } from '../rules/promises/executors/require-promise-reject.mjs';
import { rule as ruleRequireTestProcessTimeout } from '../rules/testing/processes/timeouts/require-test-process-timeout.mjs';
import { rule as ruleReusableObjectPerCall } from '../rules/reuse/reusable-object-per-call.mjs';
import { rule as ruleSettlePendingOnClose } from '../rules/lifecycles/pending/settle-pending-on-close.mjs';
import { rule as ruleSimplerBooleanLogic } from '../rules/control/simpler-boolean-logic.mjs';
import { rule as ruleStrictBooleanExpressions } from '../rules/wrapped/strict-boolean-expressions.mjs';
import { rule as ruleStructuredCatchLogging } from '../rules/errors/structured-catch-logging.mjs';
import { rule as ruleTestMustUseProductionRuntime } from '../rules/testing/assertions/test-must-use-production-runtime.mjs';
import { rule as ruleTestTsconfigPinsLibAndTypes } from '../rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';
import { rule as ruleTimeUnitMismatch } from '../rules/time/units/time-unit-mismatch.mjs';
import { rule as ruleTimeoutAbandonsOperation } from '../rules/async/timeout-abandons-operation.mjs';
import { rule as ruleUnboundedFanOut } from '../rules/concurrency/unbounded-fan-out.mjs';
import { rule as ruleUnboundedReactiveFanOut } from '../rules/concurrency/reactive/unbounded-reactive-fan-out.mjs';
import { rule as ruleUntestedRoundTrip } from '../rules/round-trips/untested-round-trip.mjs';

export const partRules = {
  'no-unhandled-void-promise': ruleNoUnhandledVoidPromise,
  'no-unindexed-foreign-key': ruleNoUnindexedForeignKey,
  'no-uninjectable-delay': ruleNoUninjectableDelay,
  'no-unknown-in-domain': ruleNoUnknownInDomain,
  'no-unknown-main-folder': ruleNoUnknownMainFolder,
  'no-unmapped-exception': ruleNoUnmappedException,
  'no-unordered-query': ruleNoUnorderedQuery,
  'no-unowned-async-assertion': ruleNoUnownedAsyncAssertion,
  'no-unsafe-deserialization': ruleNoUnsafeDeserialization,
  'no-unsafe-path-join': ruleNoUnsafePathJoin,
  'no-unused-dom-environment': ruleNoUnusedDomEnvironment,
  'no-unvalidated-schema-field': ruleNoUnvalidatedSchemaField,
  'no-wait-for-with-fake-timers': ruleNoWaitForWithFakeTimers,
  'no-wasted-collection-step': ruleNoWastedCollectionStep,
  'no-weak-assertion': ruleNoWeakAssertion,
  'no-weak-hash': ruleNoWeakHash,
  'preserve-error-cause': rulePreserveErrorCause,
  'promise-wait-deadline': rulePromiseWaitDeadline,
  'react-controlled-input': ruleReactControlledInput,
  'react-field-has-label': ruleReactFieldHasLabel,
  'react-no-direct-dom': ruleReactNoDirectDom,
  'react-no-effect-data-fetching': ruleReactNoEffectDataFetching,
  'react-no-effect-derived-state': ruleReactNoEffectDerivedState,
  'react-no-effect-event-handling': ruleReactNoEffectEventHandling,
  'react-no-hardcoded-colors': ruleReactNoHardcodedColors,
  'react-no-random-key': ruleReactNoRandomKey,
  'react-single-styling-approach': ruleReactSingleStylingApproach,
  'react-test-no-implementation-details': ruleReactTestNoImplementationDetails,
  'release-listeners-on-close': ruleReleaseListenersOnClose,
  'report-module-load-effects': ruleReportModuleLoadEffects,
  'require-atomic-updates': ruleRequireAtomicUpdates,
  'require-client-timeout': ruleRequireClientTimeout,
  'require-error-listener': ruleRequireErrorListener,
  'require-http-timeout': ruleRequireHttpTimeout,
  'require-process-timeout': ruleRequireProcessTimeout,
  'require-promise-reject': ruleRequirePromiseReject,
  'require-test-process-timeout': ruleRequireTestProcessTimeout,
  'reusable-object-per-call': ruleReusableObjectPerCall,
  'settle-pending-on-close': ruleSettlePendingOnClose,
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
