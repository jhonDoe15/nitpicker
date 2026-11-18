import { rule as ruleBoundedContainerTeardown } from '../rules/test-runtime/lifecycle/bounded-container-teardown.mts';
import { rule as ruleCognitiveComplexity } from '../rules/analysis/cognitive-complexity.mts';
import { rule as ruleContainerPauseRequiresFinallyUnpause } from '../rules/test-runtime/lifecycle/container-pause-requires-finally-unpause.mts';
import { rule as ruleContractInfrastructureType } from '../rules/contracts/contract-infrastructure-type.mts';
import { rule as ruleExhaustiveUnionPredicate } from '../rules/api-shape/exhaustive-union-predicate.mts';
import { rule as ruleFakeTimersRequireRestore } from '../test-quality/fake-timers-require-restore.mts';
import { rule as ruleFileNameCasing } from '../rules/naming/file-name-casing.mts';
import { rule as ruleHandlerEntityType } from '../rules/handlers/handler-entity-type.mts';
import { rule as ruleHermeticGitInTests } from '../rules/test-runtime/processes/hermetic-git-in-tests.mts';
import { rule as ruleHoverTestNeedsKeyboard } from '../rules/react-tests/hover-test-needs-keyboard.mts';
import { rule as ruleIntegrationTestUsesApprovedHarness } from '../rules/test-runtime/processes/integration-test-uses-approved-harness.mts';
import { rule as ruleNamingConvention } from '../rules/wrapped/naming-convention.mts';
import { rule as ruleNoAccumulatingSpread } from '../rules/collections/no-accumulating-spread.mts';
import { rule as ruleNoAccumulatorConcat } from '../rules/collections/no-accumulator-concat.mts';
import { rule as ruleNoAddOnlyCollection } from '../rules/lifecycles/growth/no-add-only-collection.mts';
import { rule as ruleNoArraySpreadArguments } from '../rules/collections/call-spreads/no-array-spread-arguments.mts';
import { rule as ruleNoAssertionInLoop } from '../test-assertions/loop-assertions/no-assertion-in-loop.mts';
import { rule as ruleNoBooleanFlagParameter } from '../rules/flags/no-boolean-flag-parameter.mts';
import { rule as ruleNoBranchInCompositionRoot } from '../rules/boundaries/no-branch-in-composition-root.mts';
import { rule as ruleNoCachedRejection } from '../rules/lifecycles/memo/no-cached-rejection.mts';
import { rule as ruleNoCheckThenWrite } from '../rules/transactions/no-check-then-write.mts';
import { rule as ruleNoChildExitEvent } from '../rules/processes/events/no-child-exit-event.mts';
import { rule as ruleNoCleanupSkippedOnFailure } from '../rules/lifecycles/release/no-cleanup-skipped-on-failure.mts';
import { rule as ruleNoCollectedStreamRows } from '../rules/streams/no-collected-stream-rows.mts';
import { rule as ruleNoComments } from '../rules/modules/no-comments.mts';
import { rule as ruleNoCompatibilityShim } from '../rules/signatures/no-compatibility-shim.mts';
import { rule as ruleNoCopiedConstant } from '../test-assertions/copied-constants/no-copied-constant.mts';
import { rule as ruleNoCopyPastedTests } from '../test-quality/no-copy-pasted-tests.mts';
import { rule as ruleNoCostlyCollectionForm } from '../rules/collections/costly-forms/no-costly-collection-form.mts';
import { rule as ruleNoDecidedCondition } from '../rules/decided/no-decided-condition.mts';
import { rule as ruleNoDefaultExport } from '../rules/syntax/no-default-export.mts';
import { rule as ruleNoDevDependencyInProduction } from '../rules/dependencies/no-dev-dependency-in-production.mts';
import { rule as ruleNoDisabledTlsVerification } from '../rules/security/tls/no-disabled-tls-verification.mts';
import { rule as ruleNoDroppedSubscriptionHandle } from '../rules/lifecycles/subscriptions/no-dropped-subscription-handle.mts';
import { rule as ruleNoDroppedTestCallback } from '../test-assertions/dropped-callback/no-dropped-test-callback.mts';
import { rule as ruleNoDualWrite } from '../rules/writes/no-dual-write.mts';
import { rule as ruleNoEagerRelation } from '../rules/persistence/no-eager-relation.mts';
import { rule as ruleNoExternalExecutablesInUnitTests } from '../rules/test-runtime/processes/no-external-executables-in-unit-tests.mts';
import { rule as ruleNoFalsyDefault } from '../rules/signatures/no-falsy-default.mts';
import { rule as ruleNoFalsyErrorCheck } from '../rules/errors/falsy-errors/no-falsy-error-check.mts';
import { rule as ruleNoFirstTestChargedSetup } from '../rules/test-runtime/lifecycle/no-first-test-charged-setup.mts';
import { rule as ruleNoFixedSleepSynchronization } from '../rules/test-runtime/lifecycle/no-fixed-sleep-synchronization.mts';
import { rule as ruleNoFloatEqualityInTests } from '../test-assertions/no-float-equality-in-tests.mts';
import { rule as ruleNoForwardingMethodAlias } from '../rules/api-shape/no-forwarding-method-alias.mts';
import { rule as ruleNoForwardingWrapper } from '../rules/api-shape/no-forwarding-wrapper.mts';
import { rule as ruleNoGenericName } from '../rules/naming/no-generic-name.mts';
import { rule as ruleNoGitRepositoryPerTest } from '../rules/test-runtime/processes/no-git-repository-per-test.mts';
import { rule as ruleNoHandwrittenBoundaryGuard } from '../rules/boundaries/no-handwritten-boundary-guard.mts';
import { rule as ruleNoHardcodedSecret } from '../rules/secrets/no-hardcoded-secret.mts';
import { rule as ruleNoInMemoryQuery } from '../rules/queries/no-in-memory-query.mts';
import { rule as ruleNoInternalModuleMocks } from '../rules/test-runtime/assertions/no-internal-module-mocks.mts';
import { rule as ruleNoIntervalPollingInTests } from '../rules/test-runtime/lifecycle/no-interval-polling-in-tests.mts';
import { rule as ruleNoIoInLoop } from '../rules/loops/no-io-in-loop.mts';
import { rule as ruleNoLazyRelationInLoop } from '../rules/effects/no-lazy-relation-in-loop.mts';
import { rule as ruleNoLoadedRowsSavedBack } from '../rules/queries/rows/no-loaded-rows-saved-back.mts';
import { rule as ruleNoLocalTimeZone } from '../rules/time/no-local-time-zone.mts';
import { rule as ruleNoLookupPerElement } from '../rules/concurrency/reactive/no-lookup-per-element.mts';
import { rule as ruleNoMagicNumbers } from '../rules/wrapped/no-magic-numbers.mts';
import { rule as ruleNoManagedResourceConstructionOutsideCompositionRoots } from '../rules/boundaries/no-managed-resource-construction-outside-composition-roots.mts';
import { rule as ruleNoManyToManyCascadeRemove } from '../rules/persistence/no-many-to-many-cascade-remove.mts';
import { rule as ruleNoMockingSubjectUnderTest } from '../rules/test-runtime/assertions/no-mocking-subject-under-test.mts';
import { rule as ruleNoModuleLevelLet } from '../rules/modules/no-module-level-let.mts';
import { rule as ruleNoModuleLevelMutableState } from '../rules/guards/no-module-level-mutable-state.mts';
import { rule as ruleNoMultipleCollectionJoins } from '../rules/joins/no-multiple-collection-joins.mts';
import { rule as ruleNoMutatingMethodInDomain } from '../rules/domain/no-mutating-method-in-domain.mts';
import { rule as ruleNoNodeProcessPerTest } from '../rules/test-runtime/processes/no-node-process-per-test.mts';
import { rule as ruleNoNull } from '../rules/syntax/no-null.mts';
import { rule as ruleNoOperandSlip } from '../rules/operands/no-operand-slip.mts';
import { rule as ruleNoOrmQueryLogging } from '../rules/database/no-orm-query-logging.mts';
import { rule as ruleNoOrmSchemaSync } from '../rules/database/no-orm-schema-sync.mts';
import { rule as ruleNoParameterMutation } from '../rules/signatures/no-parameter-mutation.mts';
import { rule as ruleNoPartialOutputAssertion } from '../rules/test-runtime/assertions/no-partial-output-assertion.mts';
import { rule as ruleNoPerCallDebounce } from '../rules/lifecycles/debounce/no-per-call-debounce.mts';
import { rule as ruleNoPerCallRegistration } from '../rules/lifecycles/registrations/no-per-call-registration.mts';
import { rule as ruleNoPipeDroppingErrors } from '../rules/streams/no-pipe-dropping-errors.mts';
import { rule as ruleNoPresenceTruthiness } from '../rules/truthiness/no-presence-truthiness.mts';
import { rule as ruleNoProcessAccessOutsideCompositionRoot } from '../rules/guards/no-process-access-outside-composition-root.mts';
import { rule as ruleNoProcessGlobalsOutsideMainGuard } from '../rules/modules/no-process-globals-outside-main-guard.mts';
import { rule as ruleNoProductionConsole } from '../rules/modules/no-production-console.mts';
import { rule as ruleNoProductionImportsInSetupFiles } from '../test-isolation/no-production-imports-in-setup-files.mts';
import { rule as ruleNoPromiseChain } from '../rules/syntax/no-promise-chain.mts';
import { rule as ruleNoQueryPerParent } from '../rules/resolvers/no-query-per-parent.mts';
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

export const partRules = {
  'bounded-container-teardown': ruleBoundedContainerTeardown,
  'cognitive-complexity': ruleCognitiveComplexity,
  'container-pause-requires-finally-unpause': ruleContainerPauseRequiresFinallyUnpause,
  'contract-infrastructure-type': ruleContractInfrastructureType,
  'exhaustive-union-predicate': ruleExhaustiveUnionPredicate,
  'fake-timers-require-restore': ruleFakeTimersRequireRestore,
  'file-name-casing': ruleFileNameCasing,
  'handler-entity-type': ruleHandlerEntityType,
  'hermetic-git-in-tests': ruleHermeticGitInTests,
  'hover-test-needs-keyboard': ruleHoverTestNeedsKeyboard,
  'integration-test-uses-approved-harness': ruleIntegrationTestUsesApprovedHarness,
  'naming-convention': ruleNamingConvention,
  'no-accumulating-spread': ruleNoAccumulatingSpread,
  'no-accumulator-concat': ruleNoAccumulatorConcat,
  'no-add-only-collection': ruleNoAddOnlyCollection,
  'no-array-spread-arguments': ruleNoArraySpreadArguments,
  'no-assertion-in-loop': ruleNoAssertionInLoop,
  'no-boolean-flag-parameter': ruleNoBooleanFlagParameter,
  'no-branch-in-composition-root': ruleNoBranchInCompositionRoot,
  'no-cached-rejection': ruleNoCachedRejection,
  'no-check-then-write': ruleNoCheckThenWrite,
  'no-child-exit-event': ruleNoChildExitEvent,
  'no-cleanup-skipped-on-failure': ruleNoCleanupSkippedOnFailure,
  'no-collected-stream-rows': ruleNoCollectedStreamRows,
  'no-comments': ruleNoComments,
  'no-compatibility-shim': ruleNoCompatibilityShim,
  'no-copied-constant': ruleNoCopiedConstant,
  'no-copy-pasted-tests': ruleNoCopyPastedTests,
  'no-costly-collection-form': ruleNoCostlyCollectionForm,
  'no-decided-condition': ruleNoDecidedCondition,
  'no-default-export': ruleNoDefaultExport,
  'no-dev-dependency-in-production': ruleNoDevDependencyInProduction,
  'no-disabled-tls-verification': ruleNoDisabledTlsVerification,
  'no-dropped-subscription-handle': ruleNoDroppedSubscriptionHandle,
  'no-dropped-test-callback': ruleNoDroppedTestCallback,
  'no-dual-write': ruleNoDualWrite,
  'no-eager-relation': ruleNoEagerRelation,
  'no-external-executables-in-unit-tests': ruleNoExternalExecutablesInUnitTests,
  'no-falsy-default': ruleNoFalsyDefault,
  'no-falsy-error-check': ruleNoFalsyErrorCheck,
  'no-first-test-charged-setup': ruleNoFirstTestChargedSetup,
  'no-fixed-sleep-synchronization': ruleNoFixedSleepSynchronization,
  'no-float-equality-in-tests': ruleNoFloatEqualityInTests,
  'no-forwarding-method-alias': ruleNoForwardingMethodAlias,
  'no-forwarding-wrapper': ruleNoForwardingWrapper,
  'no-generic-name': ruleNoGenericName,
  'no-git-repository-per-test': ruleNoGitRepositoryPerTest,
  'no-handwritten-boundary-guard': ruleNoHandwrittenBoundaryGuard,
  'no-hardcoded-secret': ruleNoHardcodedSecret,
  'no-in-memory-query': ruleNoInMemoryQuery,
  'no-internal-module-mocks': ruleNoInternalModuleMocks,
  'no-interval-polling-in-tests': ruleNoIntervalPollingInTests,
  'no-io-in-loop': ruleNoIoInLoop,
  'no-lazy-relation-in-loop': ruleNoLazyRelationInLoop,
  'no-loaded-rows-saved-back': ruleNoLoadedRowsSavedBack,
  'no-local-time-zone': ruleNoLocalTimeZone,
  'no-lookup-per-element': ruleNoLookupPerElement,
  'no-magic-numbers': ruleNoMagicNumbers,
  'no-managed-resource-construction-outside-composition-roots':
    ruleNoManagedResourceConstructionOutsideCompositionRoots,
  'no-many-to-many-cascade-remove': ruleNoManyToManyCascadeRemove,
  'no-mocking-subject-under-test': ruleNoMockingSubjectUnderTest,
  'no-module-level-let': ruleNoModuleLevelLet,
  'no-module-level-mutable-state': ruleNoModuleLevelMutableState,
  'no-multiple-collection-joins': ruleNoMultipleCollectionJoins,
  'no-mutating-method-in-domain': ruleNoMutatingMethodInDomain,
  'no-node-process-per-test': ruleNoNodeProcessPerTest,
  'no-null': ruleNoNull,
  'no-operand-slip': ruleNoOperandSlip,
  'no-orm-query-logging': ruleNoOrmQueryLogging,
  'no-orm-schema-sync': ruleNoOrmSchemaSync,
  'no-parameter-mutation': ruleNoParameterMutation,
  'no-partial-output-assertion': ruleNoPartialOutputAssertion,
  'no-per-call-debounce': ruleNoPerCallDebounce,
  'no-per-call-registration': ruleNoPerCallRegistration,
  'no-pipe-dropping-errors': ruleNoPipeDroppingErrors,
  'no-presence-truthiness': ruleNoPresenceTruthiness,
  'no-process-access-outside-composition-root': ruleNoProcessAccessOutsideCompositionRoot,
  'no-process-globals-outside-main-guard': ruleNoProcessGlobalsOutsideMainGuard,
  'no-production-console': ruleNoProductionConsole,
  'no-production-imports-in-setup-files': ruleNoProductionImportsInSetupFiles,
  'no-promise-chain': ruleNoPromiseChain,
  'no-query-per-parent': ruleNoQueryPerParent,
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
};
