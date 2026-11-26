import { rule as ruleNoModuleLevelMutableState } from '../rules/guards/no-module-level-mutable-state.mts';
import { rule as ruleNoMultipleCollectionJoins } from '../rules/joins/no-multiple-collection-joins.mts';
import { rule as ruleNoMutatingMethodInDomain } from '../rules/domain/no-mutating-method-in-domain.mts';
import { rule as ruleNoNanOnlyCheck } from '../rules/numbers/no-nan-only-check.mts';
import { rule as ruleNoNegativeCount } from '../rules/counts/no-negative-count.mts';
import { rule as ruleNoNewlineOnlyLineSplit } from '../rules/line-splits/no-newline-only-line-split.mts';
import { rule as ruleNoNodeProcessPerTest } from '../rules/test-runtime/processes/no-node-process-per-test.mts';
import { rule as ruleNoNonLatin1HeaderValue } from '../rules/encoding/no-non-latin1-header-value.mts';
import { rule as ruleNoNull } from '../rules/syntax/no-null.mts';
import { rule as ruleNoNullBranchFallThrough } from '../rules/null-branches/no-null-branch-fall-through.mts';
import { rule as ruleNoOperandSlip } from '../rules/operands/no-operand-slip.mts';
import { rule as ruleNoOrmQueryLogging } from '../rules/database/no-orm-query-logging.mts';
import { rule as ruleNoOrmSchemaSync } from '../rules/database/no-orm-schema-sync.mts';
import { rule as ruleNoOverflowingBackoff } from '../rules/backoff/no-overflowing-backoff.mts';
import { rule as ruleNoParameterMutation } from '../rules/signatures/no-parameter-mutation.mts';
import { rule as ruleNoPartialOutputAssertion } from '../rules/test-runtime/assertions/no-partial-output-assertion.mts';
import { rule as ruleNoPatternCompiledInLoop } from '../rules/repeated-work/patterns/no-pattern-compiled-in-loop.mts';
import { rule as ruleNoPerCallDebounce } from '../rules/lifecycles/debounce/no-per-call-debounce.mts';
import { rule as ruleNoPerCallRegistration } from '../rules/lifecycles/registrations/no-per-call-registration.mts';
import { rule as ruleNoPipeDroppingErrors } from '../rules/streams/no-pipe-dropping-errors.mts';
import { rule as ruleNoPlaceholderImplementation } from '../rules/placeholders/no-placeholder-implementation.mts';
import { rule as ruleNoPrefixWithoutBoundary } from '../rules/affixes/no-prefix-without-boundary.mts';
import { rule as ruleNoPresenceTruthiness } from '../rules/truthiness/no-presence-truthiness.mts';
import { rule as ruleNoProcessAccessOutsideCompositionRoot } from '../rules/guards/no-process-access-outside-composition-root.mts';
import { rule as ruleNoProcessGlobalsOutsideMainGuard } from '../rules/modules/no-process-globals-outside-main-guard.mts';
import { rule as ruleNoProductionConsole } from '../rules/modules/no-production-console.mts';
import { rule as ruleNoProductionImportsInSetupFiles } from '../test-isolation/no-production-imports-in-setup-files.mts';
import { rule as ruleNoPromiseChain } from '../rules/syntax/no-promise-chain.mts';
import { rule as ruleNoPrototypeKeyAccess } from '../rules/prototype-keys/no-prototype-key-access.mts';
import { rule as ruleNoQueryPerParent } from '../rules/resolvers/no-query-per-parent.mts';
import { rule as ruleNoRaisedTestTimeout } from '../rules/test-runtime/assertions/no-raised-test-timeout.mts';
import { rule as ruleNoRawHttpValue } from '../rules/http-values/no-raw-http-value.mts';
import { rule as ruleNoReadAllBeforePass } from '../rules/repeated-work/read-all/no-read-all-before-pass.mts';
import { rule as ruleNoRealTimeRandomOrNetwork } from '../test-isolation/no-real-time-random-or-network.mts';
import { rule as ruleNoReleaseOutsideFinally } from '../rules/resources/release/no-release-outside-finally.mts';
import { rule as ruleNoRemoteCallInTransaction } from '../rules/effects/no-remote-call-in-transaction.mts';
import { rule as ruleNoRemoteCallUnderLock } from '../rules/effects/no-remote-call-under-lock.mts';
import { rule as ruleNoRepeatedCall } from '../rules/repeated-work/repeated-calls/no-repeated-call.mts';
import { rule as ruleNoRepeatedParsePerItem } from '../rules/repeated-work/parses/no-repeated-parse-per-item.mts';
import { rule as ruleNoRepeatedStringLiteral } from '../rules/literals/no-repeated-string-literal.mts';
import { rule as ruleNoReplacingCollectionMerge } from '../rules/repeated-work/merges/no-replacing-collection-merge.mts';
import { rule as ruleNoRetryWithoutIdempotency } from '../rules/writes/no-retry-without-idempotency.mts';
import { rule as ruleNoRouteWithoutAuth } from '../rules/route-auth/no-route-without-auth.mts';
import { rule as ruleNoRuntimeExclusivePropsCheck } from '../rules/react-props/no-runtime-exclusive-props-check.mts';
import { rule as ruleNoSecretInLog } from '../rules/secrets/no-secret-in-log.mts';
import { rule as ruleNoSelfRecursion } from '../rules/control/no-self-recursion.mts';
import { rule as ruleNoSendWithoutReturn } from '../rules/handlers/fall-through/no-send-without-return.mts';
import { rule as ruleNoServerOrWorkerPerTest } from '../rules/test-runtime/processes/no-server-or-worker-per-test.mts';
import { rule as ruleNoServiceLocator } from '../rules/service-locator/no-service-locator.mts';
import { rule as ruleNoShadowedSpreadKey } from '../rules/spreads/no-shadowed-spread-key.mts';
import { rule as ruleNoSharedStatefulRegex } from '../rules/regex/no-shared-stateful-regex.mts';
import { rule as ruleNoSharedTempPathInTests } from '../rules/test-runtime/temp-paths/no-shared-temp-path-in-tests.mts';
import { rule as ruleNoSharedTestState } from '../test-quality/no-shared-test-state.mts';
import { rule as ruleNoShellStringCommand } from '../rules/guards/no-shell-string-command.mts';
import { rule as ruleNoSilentCatch } from '../rules/errors/no-silent-catch.mts';
import { rule as ruleNoSingularAndPluralProp } from '../rules/api-shape/no-singular-and-plural-prop.mts';
import { rule as ruleNoSlashOnlyRedirectGuard } from '../rules/urls/requests/no-slash-only-redirect-guard.mts';
import { rule as ruleNoSqlStringBuilding } from '../rules/security/sql/no-sql-string-building.mts';
import { rule as ruleNoStaleRetryAfterConflict } from '../rules/writes/stale-retries/no-stale-retry-after-conflict.mts';
import { rule as ruleNoStatPerListedEntry } from '../rules/repeated-work/listings/no-stat-per-listed-entry.mts';
import { rule as ruleNoStatusOnlySpawnCheck } from '../rules/processes/results/no-status-only-spawn-check.mts';
import { rule as ruleNoStderrAsFailure } from '../rules/processes/results/no-stderr-as-failure.mts';
import { rule as ruleNoStringAsRegex } from '../rules/regex/no-string-as-regex.mts';
import { rule as ruleNoStringLengthAsByteCount } from '../rules/byte-limits/no-string-length-as-byte-count.mts';
import { rule as ruleNoSubtreeSearchPerAncestor } from '../rules/repeated-work/ancestors/no-subtree-search-per-ancestor.mts';
import { rule as ruleNoSurrogateSplittingCut } from '../rules/text-truncation/no-surrogate-splitting-cut.mts';
import { rule as ruleNoSwappedArguments } from '../rules/arguments/no-swapped-arguments.mts';
import { rule as ruleNoSwitchedOffTests } from '../test-assertions/no-switched-off-tests.mts';
import { rule as ruleNoSyncNodeApiInAsync } from '../rules/async/no-sync-node-api-in-async.mts';
import { rule as ruleNoTaskOutlivingResource } from '../rules/lifetimes/no-task-outliving-resource.mts';
import { rule as ruleNoTestHelpersInSource } from '../test-placement/no-test-helpers-in-source.mts';
import { rule as ruleNoTestRetry } from '../test-assertions/no-test-retry.mts';
import { rule as ruleNoThrow } from '../rules/errors/no-throw.mts';
import { rule as ruleNoTimeOnlyUniqueName } from '../rules/unique-names/no-time-only-unique-name.mts';
import { rule as ruleNoTriStateBoolean } from '../rules/signatures/no-tri-state-boolean.mts';
import { rule as ruleNoTruncatingPairSplit } from '../rules/pair-splits/no-truncating-pair-split.mts';
import { rule as ruleNoTruncatingSplitLimit } from '../rules/split-limits/no-truncating-split-limit.mts';
import { rule as ruleNoTypeLookupPerNode } from '../rules/type-lookups/no-type-lookup-per-node.mts';
import { rule as ruleNoUiFrameworkInDomain } from '../rules/syntax/no-ui-framework-in-domain.mts';
import { rule as ruleNoUnanchoredAffixReplace } from '../rules/affixes/no-unanchored-affix-replace.mts';
import { rule as ruleNoUnatomicWrites } from '../rules/transactions/no-unatomic-writes.mts';
import { rule as ruleNoUnboundedQueryArray } from '../rules/queries/arrays/no-unbounded-query-array.mts';
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

export const partRules = {
  'no-module-level-mutable-state': ruleNoModuleLevelMutableState,
  'no-multiple-collection-joins': ruleNoMultipleCollectionJoins,
  'no-mutating-method-in-domain': ruleNoMutatingMethodInDomain,
  'no-nan-only-check': ruleNoNanOnlyCheck,
  'no-negative-count': ruleNoNegativeCount,
  'no-newline-only-line-split': ruleNoNewlineOnlyLineSplit,
  'no-node-process-per-test': ruleNoNodeProcessPerTest,
  'no-non-latin1-header-value': ruleNoNonLatin1HeaderValue,
  'no-null': ruleNoNull,
  'no-null-branch-fall-through': ruleNoNullBranchFallThrough,
  'no-operand-slip': ruleNoOperandSlip,
  'no-orm-query-logging': ruleNoOrmQueryLogging,
  'no-orm-schema-sync': ruleNoOrmSchemaSync,
  'no-overflowing-backoff': ruleNoOverflowingBackoff,
  'no-parameter-mutation': ruleNoParameterMutation,
  'no-partial-output-assertion': ruleNoPartialOutputAssertion,
  'no-pattern-compiled-in-loop': ruleNoPatternCompiledInLoop,
  'no-per-call-debounce': ruleNoPerCallDebounce,
  'no-per-call-registration': ruleNoPerCallRegistration,
  'no-pipe-dropping-errors': ruleNoPipeDroppingErrors,
  'no-placeholder-implementation': ruleNoPlaceholderImplementation,
  'no-prefix-without-boundary': ruleNoPrefixWithoutBoundary,
  'no-presence-truthiness': ruleNoPresenceTruthiness,
  'no-process-access-outside-composition-root': ruleNoProcessAccessOutsideCompositionRoot,
  'no-process-globals-outside-main-guard': ruleNoProcessGlobalsOutsideMainGuard,
  'no-production-console': ruleNoProductionConsole,
  'no-production-imports-in-setup-files': ruleNoProductionImportsInSetupFiles,
  'no-promise-chain': ruleNoPromiseChain,
  'no-prototype-key-access': ruleNoPrototypeKeyAccess,
  'no-query-per-parent': ruleNoQueryPerParent,
  'no-raised-test-timeout': ruleNoRaisedTestTimeout,
  'no-raw-http-value': ruleNoRawHttpValue,
  'no-read-all-before-pass': ruleNoReadAllBeforePass,
  'no-real-time-random-or-network': ruleNoRealTimeRandomOrNetwork,
  'no-release-outside-finally': ruleNoReleaseOutsideFinally,
  'no-remote-call-in-transaction': ruleNoRemoteCallInTransaction,
  'no-remote-call-under-lock': ruleNoRemoteCallUnderLock,
  'no-repeated-call': ruleNoRepeatedCall,
  'no-repeated-parse-per-item': ruleNoRepeatedParsePerItem,
  'no-repeated-string-literal': ruleNoRepeatedStringLiteral,
  'no-replacing-collection-merge': ruleNoReplacingCollectionMerge,
  'no-retry-without-idempotency': ruleNoRetryWithoutIdempotency,
  'no-route-without-auth': ruleNoRouteWithoutAuth,
  'no-runtime-exclusive-props-check': ruleNoRuntimeExclusivePropsCheck,
  'no-secret-in-log': ruleNoSecretInLog,
  'no-self-recursion': ruleNoSelfRecursion,
  'no-send-without-return': ruleNoSendWithoutReturn,
  'no-server-or-worker-per-test': ruleNoServerOrWorkerPerTest,
  'no-service-locator': ruleNoServiceLocator,
  'no-shadowed-spread-key': ruleNoShadowedSpreadKey,
  'no-shared-stateful-regex': ruleNoSharedStatefulRegex,
  'no-shared-temp-path-in-tests': ruleNoSharedTempPathInTests,
  'no-shared-test-state': ruleNoSharedTestState,
  'no-shell-string-command': ruleNoShellStringCommand,
  'no-silent-catch': ruleNoSilentCatch,
  'no-singular-and-plural-prop': ruleNoSingularAndPluralProp,
  'no-slash-only-redirect-guard': ruleNoSlashOnlyRedirectGuard,
  'no-sql-string-building': ruleNoSqlStringBuilding,
  'no-stale-retry-after-conflict': ruleNoStaleRetryAfterConflict,
  'no-stat-per-listed-entry': ruleNoStatPerListedEntry,
  'no-status-only-spawn-check': ruleNoStatusOnlySpawnCheck,
  'no-stderr-as-failure': ruleNoStderrAsFailure,
  'no-string-as-regex': ruleNoStringAsRegex,
  'no-string-length-as-byte-count': ruleNoStringLengthAsByteCount,
  'no-subtree-search-per-ancestor': ruleNoSubtreeSearchPerAncestor,
  'no-surrogate-splitting-cut': ruleNoSurrogateSplittingCut,
  'no-swapped-arguments': ruleNoSwappedArguments,
  'no-switched-off-tests': ruleNoSwitchedOffTests,
  'no-sync-node-api-in-async': ruleNoSyncNodeApiInAsync,
  'no-task-outliving-resource': ruleNoTaskOutlivingResource,
  'no-test-helpers-in-source': ruleNoTestHelpersInSource,
  'no-test-retry': ruleNoTestRetry,
  'no-throw': ruleNoThrow,
  'no-time-only-unique-name': ruleNoTimeOnlyUniqueName,
  'no-tri-state-boolean': ruleNoTriStateBoolean,
  'no-truncating-pair-split': ruleNoTruncatingPairSplit,
  'no-truncating-split-limit': ruleNoTruncatingSplitLimit,
  'no-type-lookup-per-node': ruleNoTypeLookupPerNode,
  'no-ui-framework-in-domain': ruleNoUiFrameworkInDomain,
  'no-unanchored-affix-replace': ruleNoUnanchoredAffixReplace,
  'no-unatomic-writes': ruleNoUnatomicWrites,
  'no-unbounded-query-array': ruleNoUnboundedQueryArray,
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
};
