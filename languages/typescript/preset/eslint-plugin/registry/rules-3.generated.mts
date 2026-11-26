import { rule as ruleNoUnbatchedHeavyRun } from '../rules/heavy-steps/no-unbatched-heavy-run.mts';
import { rule as ruleNoUnboundedQueryArray } from '../rules/queries/arrays/no-unbounded-query-array.mts';
import { rule as ruleNoUncheckedPositionalElement } from '../rules/positional-elements/no-unchecked-positional-element.mts';
import { rule as ruleNoUncheckedResponseJson } from '../rules/response-json/no-unchecked-response-json.mts';
import { rule as ruleNoUncheckedUrlSink } from '../rules/urls/links/no-unchecked-url-sink.mts';
import { rule as ruleNoUnclearedSharedMock } from '../test-quality/shared-mocks/no-uncleared-shared-mock.mts';
import { rule as ruleNoUnclearedTimeout } from '../rules/lifecycles/timers/no-uncleared-timeout.mts';
import { rule as ruleNoUnclosedFileDescriptor } from '../rules/resources/descriptors/no-unclosed-file-descriptor.mts';
import { rule as ruleNoUncoercedRequestInput } from '../rules/request-inputs/no-uncoerced-request-input.mts';
import { rule as ruleNoUncollectedTests } from '../test-isolation/no-uncollected-tests.mts';
import { rule as ruleNoUndefinedOnlyEnvCheck } from '../rules/config/no-undefined-only-env-check.mts';
import { rule as ruleNoUnencodedUrlPart } from '../rules/urls/construction/no-unencoded-url-part.mts';
import { rule as ruleNoUnescapedCssSelector } from '../rules/selectors/no-unescaped-css-selector.mts';
import { rule as ruleNoUnescapedFilterValue } from '../rules/patterns/filters/no-unescaped-filter-value.mts';
import { rule as ruleNoUnescapedHtmlInterpolation } from '../rules/patterns/html/no-unescaped-html-interpolation.mts';
import { rule as ruleNoUnescapedPatternTranslation } from '../rules/patterns/no-unescaped-pattern-translation.mts';
import { rule as ruleNoUnfilteredSoftDeleteRead } from '../rules/queries/soft-delete/no-unfiltered-soft-delete-read.mts';
import { rule as ruleNoUnguardedCyclicRecursion } from '../rules/recursion/no-unguarded-cyclic-recursion.mts';
import { rule as ruleNoUnguardedDeletedItems } from '../rules/deleted-items/no-unguarded-deleted-items.mts';
import { rule as ruleNoUnguardedJsonParse } from '../rules/parsing/no-unguarded-json-parse.mts';
import { rule as ruleNoUnguardedOptionList } from '../rules/processes/arguments/no-unguarded-option-list.mts';
import { rule as ruleNoUnguardedRecursionEntry } from '../rules/recursion/guards/no-unguarded-recursion-entry.mts';
import { rule as ruleNoUnguardedRegistryDelete } from '../rules/lifecycles/registry/no-unguarded-registry-delete.mts';
import { rule as ruleNoUnhandledUrlParse } from '../rules/parsing/no-unhandled-url-parse.mts';
import { rule as ruleNoUnhandledVoidPromise } from '../rules/promises/no-unhandled-void-promise.mts';
import { rule as ruleNoUnindexedForeignKey } from '../rules/foreign-keys/no-unindexed-foreign-key.mts';
import { rule as ruleNoUninjectableDelay } from '../rules/test-runtime/lifecycle/no-uninjectable-delay.mts';
import { rule as ruleNoUnionOrderDependence } from '../rules/union-order/no-union-order-dependence.mts';
import { rule as ruleNoUnisolatedJobLoop } from '../rules/jobs/no-unisolated-job-loop.mts';
import { rule as ruleNoUnknownInDomain } from '../rules/boundaries/no-unknown-in-domain.mts';
import { rule as ruleNoUnknownMainFolder } from '../rules/guards/no-unknown-main-folder.mts';
import { rule as ruleNoUnknownTreeSitterField } from '../rules/tree-sitter/no-unknown-tree-sitter-field.mts';
import { rule as ruleNoUnmappedException } from '../rules/errors/unmapped/no-unmapped-exception.mts';
import { rule as ruleNoUnorderedQuery } from '../rules/queries/order/no-unordered-query.mts';
import { rule as ruleNoUnownedAsyncAssertion } from '../test-assertions/unowned-async/no-unowned-async-assertion.mts';
import { rule as ruleNoUnpagedListing } from '../rules/listings/no-unpaged-listing.mts';
import { rule as ruleNoUnpinnedAssertion } from '../test-assertions/no-unpinned-assertion.mts';
import { rule as ruleNoUnresolvedRelativeUrl } from '../rules/urls/construction/no-unresolved-relative-url.mts';
import { rule as ruleNoUnsafeDeserialization } from '../rules/security/deserialization/no-unsafe-deserialization.mts';
import { rule as ruleNoUnsafePathJoin } from '../rules/guards/no-unsafe-path-join.mts';
import { rule as ruleNoUnscopedRecordAccess } from '../rules/record-scope/no-unscoped-record-access.mts';
import { rule as ruleNoUnstrippedRemoteText } from '../rules/terminal/no-unstripped-remote-text.mts';
import { rule as ruleNoUntrimmedRequestText } from '../rules/request-text/no-untrimmed-request-text.mts';
import { rule as ruleNoUnusedDomEnvironment } from '../rules/test-runtime/environment/no-unused-dom-environment.mts';
import { rule as ruleNoUnvalidatedSchemaField } from '../rules/boundaries/no-unvalidated-schema-field.mts';
import { rule as ruleNoUnversionedOrmEntity } from '../rules/database/versions/no-unversioned-orm-entity.mts';
import { rule as ruleNoUseAfterAwaitWhenDisposed } from '../rules/cancellation/disposal/no-use-after-await-when-disposed.mts';
import { rule as ruleNoUtcDateAsLocalDate } from '../rules/time/utc-dates/no-utc-date-as-local-date.mts';
import { rule as ruleNoWaitForWithFakeTimers } from '../rules/test-runtime/assertions/no-wait-for-with-fake-timers.mts';
import { rule as ruleNoWallClockBoundInTests } from '../rules/test-runtime/time-bounds/no-wall-clock-bound-in-tests.mts';
import { rule as ruleNoWallClockElapsed } from '../rules/wall-clock/no-wall-clock-elapsed.mts';
import { rule as ruleNoWastedCollectionStep } from '../rules/collections/pipelines/no-wasted-collection-step.mts';
import { rule as ruleNoWeakAssertion } from '../test-assertions/weak-assertion/no-weak-assertion.mts';
import { rule as ruleNoWeakHash } from '../rules/security/hash/no-weak-hash.mts';
import { rule as ruleNoWholeListJsonText } from '../rules/whole-lists/no-whole-list-json-text.mts';
import { rule as ruleNoWholeRowsForOneValue } from '../rules/queries/columns/no-whole-rows-for-one-value.mts';
import { rule as ruleNoWorkBeforeEarlyExit } from '../rules/repeated-work/early-exits/no-work-before-early-exit.mts';
import { rule as ruleNoWorkerStateInConcurrentTests } from '../test-quality/concurrent-tests/no-worker-state-in-concurrent-tests.mts';
import { rule as ruleNoWrapperOnlyTimeout } from '../rules/processes/wrappers/no-wrapper-only-timeout.mts';
import { rule as rulePreserveErrorCause } from '../rules/errors/preserve-error-cause.mts';
import { rule as rulePromiseWaitDeadline } from '../rules/promises/executors/promise-wait-deadline.mts';
import { rule as ruleReactControlledInput } from '../rules/react/forms/react-controlled-input.mts';
import { rule as ruleReactEffectNeedsDependencies } from '../rules/react/effects/react-effect-needs-dependencies.mts';
import { rule as ruleReactFieldHasLabel } from '../rules/react/forms/react-field-has-label.mts';
import { rule as ruleReactI18nextEscapeValue } from '../rules/react/i18n/react-i18next-escape-value.mts';
import { rule as ruleReactMutationDropsFailure } from '../rules/react/mutations/react-mutation-drops-failure.mts';
import { rule as ruleReactNoDirectDom } from '../rules/react/render/react-no-direct-dom.mts';
import { rule as ruleReactNoDroppedEffectHandle } from '../rules/react/handles/react-no-dropped-effect-handle.mts';
import { rule as ruleReactNoEagerInitialValue } from '../rules/react/initial-values/react-no-eager-initial-value.mts';
import { rule as ruleReactNoEffectDataFetching } from '../rules/react/react-no-effect-data-fetching.mts';
import { rule as ruleReactNoEffectDerivedState } from '../rules/react/react-no-effect-derived-state.mts';
import { rule as ruleReactNoEffectEventHandling } from '../rules/react/render/react-no-effect-event-handling.mts';
import { rule as ruleReactNoHardcodedColors } from '../rules/react/theme/react-no-hardcoded-colors.mts';
import { rule as ruleReactNoHydrationMismatch } from '../rules/react/hydration/react-no-hydration-mismatch.mts';
import { rule as ruleReactNoLeakedEffectResource } from '../rules/react/effects/react-no-leaked-effect-resource.mts';
import { rule as ruleReactNoLiteralIdInListComponent } from '../rules/react/ids/react-no-literal-id-in-list-component.mts';
import { rule as ruleReactNoRandomKey } from '../rules/react/render/react-no-random-key.mts';
import { rule as ruleReactNoRenderSideEffect } from '../rules/react/purity/react-no-render-side-effect.mts';
import { rule as ruleReactNoStaleStateUpdate } from '../rules/react/state/react-no-stale-state-update.mts';
import { rule as ruleReactNoUncachedUsePromise } from '../rules/react/purity/react-no-uncached-use-promise.mts';
import { rule as ruleReactNoUnstableMemoProps } from '../rules/react/memo-props/react-no-unstable-memo-props.mts';
import { rule as ruleReactNoUnstableSelectorResult } from '../rules/react/stores/react-no-unstable-selector-result.mts';
import { rule as ruleReactNoUnstableStoreSubscribe } from '../rules/react/stores/react-no-unstable-store-subscribe.mts';
import { rule as ruleReactPureStateUpdater } from '../rules/react/state/react-pure-state-updater.mts';
import { rule as ruleReactSingleStylingApproach } from '../rules/react/react-single-styling-approach.mts';
import { rule as ruleReactTestNoImplementationDetails } from '../rules/react-tests/react-test-no-implementation-details.mts';
import { rule as ruleReleaseListenersOnClose } from '../rules/lifecycles/handles/release-listeners-on-close.mts';
import { rule as ruleReportModuleLoadEffects } from '../rules/modules/report-module-load-effects.mts';
import { rule as ruleRequireAbortSignalForwarding } from '../rules/cancellation/abort-signal/require-abort-signal-forwarding.mts';
import { rule as ruleRequireAtomicUpdates } from '../rules/wrapped/require-atomic-updates.mts';
import { rule as ruleRequireClientTimeout } from '../rules/clients/require-client-timeout.mts';
import { rule as ruleRequireCompilerFileName } from '../rules/compiler-api/require-compiler-file-name.mts';
import { rule as ruleRequireErrorListener } from '../rules/events/require-error-listener.mts';
import { rule as ruleRequireGoCollectorSetting } from '../rules/child-heaps/require-go-collector-setting.mts';
import { rule as ruleRequireHttpTimeout } from '../rules/security/http/require-http-timeout.mts';
import { rule as ruleRequireJvmHeapGoal } from '../rules/child-heaps/require-jvm-heap-goal.mts';
import { rule as ruleRequireMovedTsconfigTypeRoots } from '../rules/temp-staging/require-moved-tsconfig-type-roots.mts';
import { rule as ruleRequireProcessTimeout } from '../rules/processes/require-process-timeout.mts';
import { rule as ruleRequirePromiseReject } from '../rules/promises/executors/require-promise-reject.mts';
import { rule as ruleRequireStagedParentNodeModules } from '../rules/temp-staging/require-staged-parent-node-modules.mts';

export const partRules = {
  'no-unbatched-heavy-run': ruleNoUnbatchedHeavyRun,
  'no-unbounded-query-array': ruleNoUnboundedQueryArray,
  'no-unchecked-positional-element': ruleNoUncheckedPositionalElement,
  'no-unchecked-response-json': ruleNoUncheckedResponseJson,
  'no-unchecked-url-sink': ruleNoUncheckedUrlSink,
  'no-uncleared-shared-mock': ruleNoUnclearedSharedMock,
  'no-uncleared-timeout': ruleNoUnclearedTimeout,
  'no-unclosed-file-descriptor': ruleNoUnclosedFileDescriptor,
  'no-uncoerced-request-input': ruleNoUncoercedRequestInput,
  'no-uncollected-tests': ruleNoUncollectedTests,
  'no-undefined-only-env-check': ruleNoUndefinedOnlyEnvCheck,
  'no-unencoded-url-part': ruleNoUnencodedUrlPart,
  'no-unescaped-css-selector': ruleNoUnescapedCssSelector,
  'no-unescaped-filter-value': ruleNoUnescapedFilterValue,
  'no-unescaped-html-interpolation': ruleNoUnescapedHtmlInterpolation,
  'no-unescaped-pattern-translation': ruleNoUnescapedPatternTranslation,
  'no-unfiltered-soft-delete-read': ruleNoUnfilteredSoftDeleteRead,
  'no-unguarded-cyclic-recursion': ruleNoUnguardedCyclicRecursion,
  'no-unguarded-deleted-items': ruleNoUnguardedDeletedItems,
  'no-unguarded-json-parse': ruleNoUnguardedJsonParse,
  'no-unguarded-option-list': ruleNoUnguardedOptionList,
  'no-unguarded-recursion-entry': ruleNoUnguardedRecursionEntry,
  'no-unguarded-registry-delete': ruleNoUnguardedRegistryDelete,
  'no-unhandled-url-parse': ruleNoUnhandledUrlParse,
  'no-unhandled-void-promise': ruleNoUnhandledVoidPromise,
  'no-unindexed-foreign-key': ruleNoUnindexedForeignKey,
  'no-uninjectable-delay': ruleNoUninjectableDelay,
  'no-union-order-dependence': ruleNoUnionOrderDependence,
  'no-unisolated-job-loop': ruleNoUnisolatedJobLoop,
  'no-unknown-in-domain': ruleNoUnknownInDomain,
  'no-unknown-main-folder': ruleNoUnknownMainFolder,
  'no-unknown-tree-sitter-field': ruleNoUnknownTreeSitterField,
  'no-unmapped-exception': ruleNoUnmappedException,
  'no-unordered-query': ruleNoUnorderedQuery,
  'no-unowned-async-assertion': ruleNoUnownedAsyncAssertion,
  'no-unpaged-listing': ruleNoUnpagedListing,
  'no-unpinned-assertion': ruleNoUnpinnedAssertion,
  'no-unresolved-relative-url': ruleNoUnresolvedRelativeUrl,
  'no-unsafe-deserialization': ruleNoUnsafeDeserialization,
  'no-unsafe-path-join': ruleNoUnsafePathJoin,
  'no-unscoped-record-access': ruleNoUnscopedRecordAccess,
  'no-unstripped-remote-text': ruleNoUnstrippedRemoteText,
  'no-untrimmed-request-text': ruleNoUntrimmedRequestText,
  'no-unused-dom-environment': ruleNoUnusedDomEnvironment,
  'no-unvalidated-schema-field': ruleNoUnvalidatedSchemaField,
  'no-unversioned-orm-entity': ruleNoUnversionedOrmEntity,
  'no-use-after-await-when-disposed': ruleNoUseAfterAwaitWhenDisposed,
  'no-utc-date-as-local-date': ruleNoUtcDateAsLocalDate,
  'no-wait-for-with-fake-timers': ruleNoWaitForWithFakeTimers,
  'no-wall-clock-bound-in-tests': ruleNoWallClockBoundInTests,
  'no-wall-clock-elapsed': ruleNoWallClockElapsed,
  'no-wasted-collection-step': ruleNoWastedCollectionStep,
  'no-weak-assertion': ruleNoWeakAssertion,
  'no-weak-hash': ruleNoWeakHash,
  'no-whole-list-json-text': ruleNoWholeListJsonText,
  'no-whole-rows-for-one-value': ruleNoWholeRowsForOneValue,
  'no-work-before-early-exit': ruleNoWorkBeforeEarlyExit,
  'no-worker-state-in-concurrent-tests': ruleNoWorkerStateInConcurrentTests,
  'no-wrapper-only-timeout': ruleNoWrapperOnlyTimeout,
  'preserve-error-cause': rulePreserveErrorCause,
  'promise-wait-deadline': rulePromiseWaitDeadline,
  'react-controlled-input': ruleReactControlledInput,
  'react-effect-needs-dependencies': ruleReactEffectNeedsDependencies,
  'react-field-has-label': ruleReactFieldHasLabel,
  'react-i18next-escape-value': ruleReactI18nextEscapeValue,
  'react-mutation-drops-failure': ruleReactMutationDropsFailure,
  'react-no-direct-dom': ruleReactNoDirectDom,
  'react-no-dropped-effect-handle': ruleReactNoDroppedEffectHandle,
  'react-no-eager-initial-value': ruleReactNoEagerInitialValue,
  'react-no-effect-data-fetching': ruleReactNoEffectDataFetching,
  'react-no-effect-derived-state': ruleReactNoEffectDerivedState,
  'react-no-effect-event-handling': ruleReactNoEffectEventHandling,
  'react-no-hardcoded-colors': ruleReactNoHardcodedColors,
  'react-no-hydration-mismatch': ruleReactNoHydrationMismatch,
  'react-no-leaked-effect-resource': ruleReactNoLeakedEffectResource,
  'react-no-literal-id-in-list-component': ruleReactNoLiteralIdInListComponent,
  'react-no-random-key': ruleReactNoRandomKey,
  'react-no-render-side-effect': ruleReactNoRenderSideEffect,
  'react-no-stale-state-update': ruleReactNoStaleStateUpdate,
  'react-no-uncached-use-promise': ruleReactNoUncachedUsePromise,
  'react-no-unstable-memo-props': ruleReactNoUnstableMemoProps,
  'react-no-unstable-selector-result': ruleReactNoUnstableSelectorResult,
  'react-no-unstable-store-subscribe': ruleReactNoUnstableStoreSubscribe,
  'react-pure-state-updater': ruleReactPureStateUpdater,
  'react-single-styling-approach': ruleReactSingleStylingApproach,
  'react-test-no-implementation-details': ruleReactTestNoImplementationDetails,
  'release-listeners-on-close': ruleReleaseListenersOnClose,
  'report-module-load-effects': ruleReportModuleLoadEffects,
  'require-abort-signal-forwarding': ruleRequireAbortSignalForwarding,
  'require-atomic-updates': ruleRequireAtomicUpdates,
  'require-client-timeout': ruleRequireClientTimeout,
  'require-compiler-file-name': ruleRequireCompilerFileName,
  'require-error-listener': ruleRequireErrorListener,
  'require-go-collector-setting': ruleRequireGoCollectorSetting,
  'require-http-timeout': ruleRequireHttpTimeout,
  'require-jvm-heap-goal': ruleRequireJvmHeapGoal,
  'require-moved-tsconfig-type-roots': ruleRequireMovedTsconfigTypeRoots,
  'require-process-timeout': ruleRequireProcessTimeout,
  'require-promise-reject': ruleRequirePromiseReject,
  'require-staged-parent-node-modules': ruleRequireStagedParentNodeModules,
};
