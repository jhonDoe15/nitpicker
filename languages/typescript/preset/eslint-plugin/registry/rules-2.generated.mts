import { rule as ruleNoRaisedTestTimeout } from '../rules/test-runtime/assertions/no-raised-test-timeout.mts';
import { rule as ruleNoRawHttpValue } from '../rules/http-values/no-raw-http-value.mts';
import { rule as ruleNoRealTimeRandomOrNetwork } from '../test-isolation/no-real-time-random-or-network.mts';
import { rule as ruleNoReleaseOutsideFinally } from '../rules/resources/release/no-release-outside-finally.mts';
import { rule as ruleNoRemoteCallInTransaction } from '../rules/effects/no-remote-call-in-transaction.mts';
import { rule as ruleNoRemoteCallUnderLock } from '../rules/effects/no-remote-call-under-lock.mts';
import { rule as ruleNoRepeatedStringLiteral } from '../rules/literals/no-repeated-string-literal.mts';
import { rule as ruleNoRetryWithoutIdempotency } from '../rules/writes/no-retry-without-idempotency.mts';
import { rule as ruleNoRouteWithoutAuth } from '../rules/route-auth/no-route-without-auth.mts';
import { rule as ruleNoRuntimeExclusivePropsCheck } from '../rules/react-props/no-runtime-exclusive-props-check.mts';
import { rule as ruleNoSecretInLog } from '../rules/secrets/no-secret-in-log.mts';
import { rule as ruleNoSelfRecursion } from '../rules/control/no-self-recursion.mts';
import { rule as ruleNoSendWithoutReturn } from '../rules/handlers/fall-through/no-send-without-return.mts';
import { rule as ruleNoServerOrWorkerPerTest } from '../rules/test-runtime/processes/no-server-or-worker-per-test.mts';
import { rule as ruleNoServiceLocator } from '../rules/service-locator/no-service-locator.mts';
import { rule as ruleNoSharedStatefulRegex } from '../rules/regex/no-shared-stateful-regex.mts';
import { rule as ruleNoSharedTestState } from '../test-quality/no-shared-test-state.mts';
import { rule as ruleNoShellStringCommand } from '../rules/guards/no-shell-string-command.mts';
import { rule as ruleNoSilentCatch } from '../rules/errors/no-silent-catch.mts';
import { rule as ruleNoSingularAndPluralProp } from '../rules/api-shape/no-singular-and-plural-prop.mts';
import { rule as ruleNoSqlStringBuilding } from '../rules/security/sql/no-sql-string-building.mts';
import { rule as ruleNoStaleRetryAfterConflict } from '../rules/writes/stale-retries/no-stale-retry-after-conflict.mts';
import { rule as ruleNoStringAsRegex } from '../rules/regex/no-string-as-regex.mts';
import { rule as ruleNoSurrogateSplittingCut } from '../rules/text-truncation/no-surrogate-splitting-cut.mts';
import { rule as ruleNoSwitchedOffTests } from '../test-assertions/no-switched-off-tests.mts';
import { rule as ruleNoSyncNodeApiInAsync } from '../rules/async/no-sync-node-api-in-async.mts';
import { rule as ruleNoTaskOutlivingResource } from '../rules/lifetimes/no-task-outliving-resource.mts';
import { rule as ruleNoTestHelpersInSource } from '../test-placement/no-test-helpers-in-source.mts';
import { rule as ruleNoTestRetry } from '../test-assertions/no-test-retry.mts';
import { rule as ruleNoThrow } from '../rules/errors/no-throw.mts';
import { rule as ruleNoTriStateBoolean } from '../rules/signatures/no-tri-state-boolean.mts';
import { rule as ruleNoTruncatingPairSplit } from '../rules/pair-splits/no-truncating-pair-split.mts';
import { rule as ruleNoUiFrameworkInDomain } from '../rules/syntax/no-ui-framework-in-domain.mts';
import { rule as ruleNoUnanchoredAffixReplace } from '../rules/affixes/no-unanchored-affix-replace.mts';
import { rule as ruleNoUnatomicWrites } from '../rules/transactions/no-unatomic-writes.mts';
import { rule as ruleNoUnboundedQueryArray } from '../rules/queries/arrays/no-unbounded-query-array.mts';
import { rule as ruleNoUncheckedResponseJson } from '../rules/response-json/no-unchecked-response-json.mts';
import { rule as ruleNoUnclearedTimeout } from '../rules/lifecycles/timers/no-uncleared-timeout.mts';
import { rule as ruleNoUnclosedFileDescriptor } from '../rules/resources/descriptors/no-unclosed-file-descriptor.mts';
import { rule as ruleNoUncoercedRequestInput } from '../rules/request-inputs/no-uncoerced-request-input.mts';
import { rule as ruleNoUncollectedTests } from '../test-isolation/no-uncollected-tests.mts';
import { rule as ruleNoUndefinedOnlyEnvCheck } from '../rules/config/no-undefined-only-env-check.mts';
import { rule as ruleNoUnescapedFilterValue } from '../rules/patterns/filters/no-unescaped-filter-value.mts';
import { rule as ruleNoUnescapedHtmlInterpolation } from '../rules/patterns/html/no-unescaped-html-interpolation.mts';
import { rule as ruleNoUnescapedPatternTranslation } from '../rules/patterns/no-unescaped-pattern-translation.mts';
import { rule as ruleNoUnfilteredSoftDeleteRead } from '../rules/queries/soft-delete/no-unfiltered-soft-delete-read.mts';
import { rule as ruleNoUnguardedCyclicRecursion } from '../rules/recursion/no-unguarded-cyclic-recursion.mts';
import { rule as ruleNoUnguardedDeletedItems } from '../rules/deleted-items/no-unguarded-deleted-items.mts';
import { rule as ruleNoUnguardedRegistryDelete } from '../rules/lifecycles/registry/no-unguarded-registry-delete.mts';
import { rule as ruleNoUnhandledUrlParse } from '../rules/parsing/no-unhandled-url-parse.mts';
import { rule as ruleNoUnhandledVoidPromise } from '../rules/promises/no-unhandled-void-promise.mts';
import { rule as ruleNoUnindexedForeignKey } from '../rules/foreign-keys/no-unindexed-foreign-key.mts';
import { rule as ruleNoUninjectableDelay } from '../rules/test-runtime/lifecycle/no-uninjectable-delay.mts';
import { rule as ruleNoUnisolatedJobLoop } from '../rules/jobs/no-unisolated-job-loop.mts';
import { rule as ruleNoUnknownInDomain } from '../rules/boundaries/no-unknown-in-domain.mts';
import { rule as ruleNoUnknownMainFolder } from '../rules/guards/no-unknown-main-folder.mts';
import { rule as ruleNoUnmappedException } from '../rules/errors/unmapped/no-unmapped-exception.mts';
import { rule as ruleNoUnorderedQuery } from '../rules/queries/order/no-unordered-query.mts';
import { rule as ruleNoUnownedAsyncAssertion } from '../test-assertions/unowned-async/no-unowned-async-assertion.mts';
import { rule as ruleNoUnpagedListing } from '../rules/listings/no-unpaged-listing.mts';
import { rule as ruleNoUnpinnedAssertion } from '../test-assertions/no-unpinned-assertion.mts';
import { rule as ruleNoUnsafeDeserialization } from '../rules/security/deserialization/no-unsafe-deserialization.mts';
import { rule as ruleNoUnsafePathJoin } from '../rules/guards/no-unsafe-path-join.mts';
import { rule as ruleNoUnscopedRecordAccess } from '../rules/record-scope/no-unscoped-record-access.mts';
import { rule as ruleNoUntrimmedRequestText } from '../rules/request-text/no-untrimmed-request-text.mts';
import { rule as ruleNoUnusedDomEnvironment } from '../rules/test-runtime/environment/no-unused-dom-environment.mts';
import { rule as ruleNoUnvalidatedSchemaField } from '../rules/boundaries/no-unvalidated-schema-field.mts';
import { rule as ruleNoUseAfterAwaitWhenDisposed } from '../rules/cancellation/disposal/no-use-after-await-when-disposed.mts';
import { rule as ruleNoWaitForWithFakeTimers } from '../rules/test-runtime/assertions/no-wait-for-with-fake-timers.mts';
import { rule as ruleNoWallClockElapsed } from '../rules/wall-clock/no-wall-clock-elapsed.mts';
import { rule as ruleNoWastedCollectionStep } from '../rules/collections/pipelines/no-wasted-collection-step.mts';
import { rule as ruleNoWeakAssertion } from '../test-assertions/weak-assertion/no-weak-assertion.mts';
import { rule as ruleNoWeakHash } from '../rules/security/hash/no-weak-hash.mts';
import { rule as ruleNoWholeRowsForOneValue } from '../rules/queries/columns/no-whole-rows-for-one-value.mts';
import { rule as rulePreserveErrorCause } from '../rules/errors/preserve-error-cause.mts';
import { rule as rulePromiseWaitDeadline } from '../rules/promises/executors/promise-wait-deadline.mts';
import { rule as ruleReactControlledInput } from '../rules/react/forms/react-controlled-input.mts';
import { rule as ruleReactEffectNeedsDependencies } from '../rules/react/effects/react-effect-needs-dependencies.mts';
import { rule as ruleReactFieldHasLabel } from '../rules/react/forms/react-field-has-label.mts';
import { rule as ruleReactI18nextEscapeValue } from '../rules/react/i18n/react-i18next-escape-value.mts';
import { rule as ruleReactMutationDropsFailure } from '../rules/react/mutations/react-mutation-drops-failure.mts';
import { rule as ruleReactNoDirectDom } from '../rules/react/render/react-no-direct-dom.mts';
import { rule as ruleReactNoEagerInitialValue } from '../rules/react/initial-values/react-no-eager-initial-value.mts';
import { rule as ruleReactNoEffectDataFetching } from '../rules/react/react-no-effect-data-fetching.mts';
import { rule as ruleReactNoEffectDerivedState } from '../rules/react/react-no-effect-derived-state.mts';
import { rule as ruleReactNoEffectEventHandling } from '../rules/react/render/react-no-effect-event-handling.mts';
import { rule as ruleReactNoHardcodedColors } from '../rules/react/theme/react-no-hardcoded-colors.mts';
import { rule as ruleReactNoLiteralIdInListComponent } from '../rules/react/ids/react-no-literal-id-in-list-component.mts';
import { rule as ruleReactNoRandomKey } from '../rules/react/render/react-no-random-key.mts';
import { rule as ruleReactSingleStylingApproach } from '../rules/react/react-single-styling-approach.mjs';
import { rule as ruleReactTestNoImplementationDetails } from '../rules/react-tests/react-test-no-implementation-details.mts';
import { rule as ruleReleaseListenersOnClose } from '../rules/lifecycles/handles/release-listeners-on-close.mts';
import { rule as ruleReportModuleLoadEffects } from '../rules/modules/report-module-load-effects.mts';
import { rule as ruleRequireAbortSignalForwarding } from '../rules/cancellation/abort-signal/require-abort-signal-forwarding.mts';
import { rule as ruleRequireAtomicUpdates } from '../rules/wrapped/require-atomic-updates.mts';
import { rule as ruleRequireClientTimeout } from '../rules/clients/require-client-timeout.mts';
import { rule as ruleRequireErrorListener } from '../rules/events/require-error-listener.mts';
import { rule as ruleRequireHttpTimeout } from '../rules/security/http/require-http-timeout.mts';
import { rule as ruleRequireProcessTimeout } from '../rules/processes/require-process-timeout.mts';
import { rule as ruleRequirePromiseReject } from '../rules/promises/executors/require-promise-reject.mts';

export const partRules = {
  'no-raised-test-timeout': ruleNoRaisedTestTimeout,
  'no-raw-http-value': ruleNoRawHttpValue,
  'no-real-time-random-or-network': ruleNoRealTimeRandomOrNetwork,
  'no-release-outside-finally': ruleNoReleaseOutsideFinally,
  'no-remote-call-in-transaction': ruleNoRemoteCallInTransaction,
  'no-remote-call-under-lock': ruleNoRemoteCallUnderLock,
  'no-repeated-string-literal': ruleNoRepeatedStringLiteral,
  'no-retry-without-idempotency': ruleNoRetryWithoutIdempotency,
  'no-route-without-auth': ruleNoRouteWithoutAuth,
  'no-runtime-exclusive-props-check': ruleNoRuntimeExclusivePropsCheck,
  'no-secret-in-log': ruleNoSecretInLog,
  'no-self-recursion': ruleNoSelfRecursion,
  'no-send-without-return': ruleNoSendWithoutReturn,
  'no-server-or-worker-per-test': ruleNoServerOrWorkerPerTest,
  'no-service-locator': ruleNoServiceLocator,
  'no-shared-stateful-regex': ruleNoSharedStatefulRegex,
  'no-shared-test-state': ruleNoSharedTestState,
  'no-shell-string-command': ruleNoShellStringCommand,
  'no-silent-catch': ruleNoSilentCatch,
  'no-singular-and-plural-prop': ruleNoSingularAndPluralProp,
  'no-sql-string-building': ruleNoSqlStringBuilding,
  'no-stale-retry-after-conflict': ruleNoStaleRetryAfterConflict,
  'no-string-as-regex': ruleNoStringAsRegex,
  'no-surrogate-splitting-cut': ruleNoSurrogateSplittingCut,
  'no-switched-off-tests': ruleNoSwitchedOffTests,
  'no-sync-node-api-in-async': ruleNoSyncNodeApiInAsync,
  'no-task-outliving-resource': ruleNoTaskOutlivingResource,
  'no-test-helpers-in-source': ruleNoTestHelpersInSource,
  'no-test-retry': ruleNoTestRetry,
  'no-throw': ruleNoThrow,
  'no-tri-state-boolean': ruleNoTriStateBoolean,
  'no-truncating-pair-split': ruleNoTruncatingPairSplit,
  'no-ui-framework-in-domain': ruleNoUiFrameworkInDomain,
  'no-unanchored-affix-replace': ruleNoUnanchoredAffixReplace,
  'no-unatomic-writes': ruleNoUnatomicWrites,
  'no-unbounded-query-array': ruleNoUnboundedQueryArray,
  'no-unchecked-response-json': ruleNoUncheckedResponseJson,
  'no-uncleared-timeout': ruleNoUnclearedTimeout,
  'no-unclosed-file-descriptor': ruleNoUnclosedFileDescriptor,
  'no-uncoerced-request-input': ruleNoUncoercedRequestInput,
  'no-uncollected-tests': ruleNoUncollectedTests,
  'no-undefined-only-env-check': ruleNoUndefinedOnlyEnvCheck,
  'no-unescaped-filter-value': ruleNoUnescapedFilterValue,
  'no-unescaped-html-interpolation': ruleNoUnescapedHtmlInterpolation,
  'no-unescaped-pattern-translation': ruleNoUnescapedPatternTranslation,
  'no-unfiltered-soft-delete-read': ruleNoUnfilteredSoftDeleteRead,
  'no-unguarded-cyclic-recursion': ruleNoUnguardedCyclicRecursion,
  'no-unguarded-deleted-items': ruleNoUnguardedDeletedItems,
  'no-unguarded-registry-delete': ruleNoUnguardedRegistryDelete,
  'no-unhandled-url-parse': ruleNoUnhandledUrlParse,
  'no-unhandled-void-promise': ruleNoUnhandledVoidPromise,
  'no-unindexed-foreign-key': ruleNoUnindexedForeignKey,
  'no-uninjectable-delay': ruleNoUninjectableDelay,
  'no-unisolated-job-loop': ruleNoUnisolatedJobLoop,
  'no-unknown-in-domain': ruleNoUnknownInDomain,
  'no-unknown-main-folder': ruleNoUnknownMainFolder,
  'no-unmapped-exception': ruleNoUnmappedException,
  'no-unordered-query': ruleNoUnorderedQuery,
  'no-unowned-async-assertion': ruleNoUnownedAsyncAssertion,
  'no-unpaged-listing': ruleNoUnpagedListing,
  'no-unpinned-assertion': ruleNoUnpinnedAssertion,
  'no-unsafe-deserialization': ruleNoUnsafeDeserialization,
  'no-unsafe-path-join': ruleNoUnsafePathJoin,
  'no-unscoped-record-access': ruleNoUnscopedRecordAccess,
  'no-untrimmed-request-text': ruleNoUntrimmedRequestText,
  'no-unused-dom-environment': ruleNoUnusedDomEnvironment,
  'no-unvalidated-schema-field': ruleNoUnvalidatedSchemaField,
  'no-use-after-await-when-disposed': ruleNoUseAfterAwaitWhenDisposed,
  'no-wait-for-with-fake-timers': ruleNoWaitForWithFakeTimers,
  'no-wall-clock-elapsed': ruleNoWallClockElapsed,
  'no-wasted-collection-step': ruleNoWastedCollectionStep,
  'no-weak-assertion': ruleNoWeakAssertion,
  'no-weak-hash': ruleNoWeakHash,
  'no-whole-rows-for-one-value': ruleNoWholeRowsForOneValue,
  'preserve-error-cause': rulePreserveErrorCause,
  'promise-wait-deadline': rulePromiseWaitDeadline,
  'react-controlled-input': ruleReactControlledInput,
  'react-effect-needs-dependencies': ruleReactEffectNeedsDependencies,
  'react-field-has-label': ruleReactFieldHasLabel,
  'react-i18next-escape-value': ruleReactI18nextEscapeValue,
  'react-mutation-drops-failure': ruleReactMutationDropsFailure,
  'react-no-direct-dom': ruleReactNoDirectDom,
  'react-no-eager-initial-value': ruleReactNoEagerInitialValue,
  'react-no-effect-data-fetching': ruleReactNoEffectDataFetching,
  'react-no-effect-derived-state': ruleReactNoEffectDerivedState,
  'react-no-effect-event-handling': ruleReactNoEffectEventHandling,
  'react-no-hardcoded-colors': ruleReactNoHardcodedColors,
  'react-no-literal-id-in-list-component': ruleReactNoLiteralIdInListComponent,
  'react-no-random-key': ruleReactNoRandomKey,
  'react-single-styling-approach': ruleReactSingleStylingApproach,
  'react-test-no-implementation-details': ruleReactTestNoImplementationDetails,
  'release-listeners-on-close': ruleReleaseListenersOnClose,
  'report-module-load-effects': ruleReportModuleLoadEffects,
  'require-abort-signal-forwarding': ruleRequireAbortSignalForwarding,
  'require-atomic-updates': ruleRequireAtomicUpdates,
  'require-client-timeout': ruleRequireClientTimeout,
  'require-error-listener': ruleRequireErrorListener,
  'require-http-timeout': ruleRequireHttpTimeout,
  'require-process-timeout': ruleRequireProcessTimeout,
  'require-promise-reject': ruleRequirePromiseReject,
};
