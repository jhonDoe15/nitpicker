import { rule as ruleBoundedContainerTeardown } from './rules/testing/lifecycle/bounded-container-teardown.mjs';
import { rule as ruleCognitiveComplexity } from './rules/analysis/cognitive-complexity.mjs';
import { rule as ruleContainerPauseRequiresFinallyUnpause } from './rules/testing/lifecycle/container-pause-requires-finally-unpause.mjs';
import { rule as ruleExhaustiveUnionPredicate } from './rules/api-shape/exhaustive-union-predicate.mjs';
import { rule as ruleFakeTimersRequireRestore } from './test-quality/fake-timers-require-restore.mjs';
import { rule as ruleFileNameCasing } from './rules/naming/file-name-casing.mjs';
import { rule as ruleHermeticGitInTests } from './rules/testing/processes/hermetic-git-in-tests.mjs';
import { rule as ruleHoverTestNeedsKeyboard } from './rules/react-tests/hover-test-needs-keyboard.mjs';
import { rule as ruleIntegrationTestUsesApprovedHarness } from './rules/testing/processes/integration-test-uses-approved-harness.mjs';
import { rule as ruleNamingConvention } from './rules/wrapped/naming-convention.mjs';
import { rule as ruleNoAccumulatingSpread } from './rules/collections/no-accumulating-spread.mjs';
import { rule as ruleNoAssertionInLoop } from './test-assertions/loop-assertions/no-assertion-in-loop.mjs';
import { rule as ruleNoBranchInCompositionRoot } from './rules/boundaries/no-branch-in-composition-root.mjs';
import { rule as ruleNoComments } from './rules/modules/no-comments.mjs';
import { rule as ruleNoCompatibilityShim } from './rules/signatures/no-compatibility-shim.mjs';
import { rule as ruleNoCopyPastedTests } from './test-quality/no-copy-pasted-tests.mjs';
import { rule as ruleNoDefaultExport } from './rules/syntax/no-default-export.mjs';
import { rule as ruleNoDevDependencyInProduction } from './rules/dependencies/no-dev-dependency-in-production.mjs';
import { rule as ruleNoDisabledTlsVerification } from './rules/security/tls/no-disabled-tls-verification.mjs';
import { rule as ruleNoEagerRelation } from './rules/persistence/no-eager-relation.mjs';
import { rule as ruleNoExternalExecutablesInUnitTests } from './rules/testing/processes/no-external-executables-in-unit-tests.mjs';
import { rule as ruleNoFalsyDefault } from './rules/signatures/no-falsy-default.mjs';
import { rule as ruleNoFirstTestChargedSetup } from './rules/testing/lifecycle/no-first-test-charged-setup.mjs';
import { rule as ruleNoFixedSleepSynchronization } from './rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { rule as ruleNoForwardingWrapper } from './rules/api-shape/no-forwarding-wrapper.mjs';
import { rule as ruleNoGitRepositoryPerTest } from './rules/testing/processes/no-git-repository-per-test.mjs';
import { rule as ruleNoHandwrittenBoundaryGuard } from './rules/boundaries/no-handwritten-boundary-guard.mjs';
import { rule as ruleNoInMemoryQuery } from './rules/queries/no-in-memory-query.mjs';
import { rule as ruleNoInternalModuleMocks } from './rules/testing/assertions/no-internal-module-mocks.mjs';
import { rule as ruleNoIntervalPollingInTests } from './rules/testing/lifecycle/no-interval-polling-in-tests.mjs';
import { rule as ruleNoLocalTimeZone } from './rules/time/no-local-time-zone.mjs';
import { rule as ruleNoMagicNumbers } from './rules/wrapped/no-magic-numbers.mjs';
import { rule as ruleNoManagedResourceConstructionOutsideCompositionRoots } from './rules/boundaries/no-managed-resource-construction-outside-composition-roots.mjs';
import { rule as ruleNoManyToManyCascadeRemove } from './rules/persistence/no-many-to-many-cascade-remove.mjs';
import { rule as ruleNoMockingSubjectUnderTest } from './rules/testing/assertions/no-mocking-subject-under-test.mjs';
import { rule as ruleNoModuleLevelLet } from './rules/modules/no-module-level-let.mjs';
import { rule as ruleNoModuleLevelMutableState } from './rules/guards/no-module-level-mutable-state.mjs';
import { rule as ruleNoMutatingMethodInDomain } from './rules/domain/no-mutating-method-in-domain.mjs';
import { rule as ruleNoNodeProcessPerTest } from './rules/testing/processes/no-node-process-per-test.mjs';
import { rule as ruleNoNull } from './rules/syntax/no-null.mjs';
import { rule as ruleNoOrmQueryLogging } from './rules/database/no-orm-query-logging.mjs';
import { rule as ruleNoOrmSchemaSync } from './rules/database/no-orm-schema-sync.mjs';
import { rule as ruleNoParameterMutation } from './rules/signatures/no-parameter-mutation.mjs';
import { rule as ruleNoPartialOutputAssertion } from './rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as ruleNoProcessAccessOutsideCompositionRoot } from './rules/guards/no-process-access-outside-composition-root.mjs';
import { rule as ruleNoProcessGlobalsOutsideMainGuard } from './rules/modules/no-process-globals-outside-main-guard.mjs';
import { rule as ruleNoProductionConsole } from './rules/modules/no-production-console.mjs';
import { rule as ruleNoProductionImportsInSetupFiles } from './test-isolation/no-production-imports-in-setup-files.mjs';
import { rule as ruleNoPromiseChain } from './rules/syntax/no-promise-chain.mjs';
import { rule as ruleNoRaisedTestTimeout } from './rules/testing/assertions/no-raised-test-timeout.mjs';
import { rule as ruleNoRealTimeRandomOrNetwork } from './test-isolation/no-real-time-random-or-network.mjs';
import { rule as ruleNoRuntimeExclusivePropsCheck } from './rules/react-props/no-runtime-exclusive-props-check.mjs';
import { rule as ruleNoSelfRecursion } from './rules/control/no-self-recursion.mjs';
import { rule as ruleNoServerOrWorkerPerTest } from './rules/testing/processes/no-server-or-worker-per-test.mjs';
import { rule as ruleNoSharedStatefulRegex } from './rules/regex/no-shared-stateful-regex.mjs';
import { rule as ruleNoSharedTestState } from './test-quality/no-shared-test-state.mjs';
import { rule as ruleNoShellStringCommand } from './rules/guards/no-shell-string-command.mjs';
import { rule as ruleNoSilentCatch } from './rules/errors/no-silent-catch.mjs';
import { rule as ruleNoSingularAndPluralProp } from './rules/api-shape/no-singular-and-plural-prop.mjs';
import { rule as ruleNoSqlStringBuilding } from './rules/security/sql/no-sql-string-building.mjs';
import { rule as ruleNoStringAsRegex } from './rules/regex/no-string-as-regex.mjs';
import { rule as ruleNoSwitchedOffTests } from './test-assertions/no-switched-off-tests.mjs';
import { rule as ruleNoTestHelpersInSource } from './test-placement/no-test-helpers-in-source.mjs';
import { rule as ruleNoTestRetry } from './test-assertions/no-test-retry.mjs';
import { rule as ruleNoThrow } from './rules/errors/no-throw.mjs';
import { rule as ruleNoTriStateBoolean } from './rules/signatures/no-tri-state-boolean.mjs';
import { rule as ruleNoUiFrameworkInDomain } from './rules/syntax/no-ui-framework-in-domain.mjs';
import { rule as ruleNoUncollectedTests } from './test-isolation/no-uncollected-tests.mjs';
import { rule as ruleNoUnhandledUrlParse } from './rules/parsing/no-unhandled-url-parse.mjs';
import { rule as ruleNoUnhandledVoidPromise } from './rules/promises/no-unhandled-void-promise.mjs';
import { rule as ruleNoUnindexedForeignKey } from './rules/foreign-keys/no-unindexed-foreign-key.mjs';
import { rule as ruleNoUninjectableDelay } from './rules/testing/lifecycle/no-uninjectable-delay.mjs';
import { rule as ruleNoUnknownInDomain } from './rules/boundaries/no-unknown-in-domain.mjs';
import { rule as ruleNoUnknownMainFolder } from './rules/guards/no-unknown-main-folder.mjs';
import { rule as ruleNoUnownedAsyncAssertion } from './test-assertions/unowned-async/no-unowned-async-assertion.mjs';
import { rule as ruleNoUnsafeDeserialization } from './rules/security/deserialization/no-unsafe-deserialization.mjs';
import { rule as ruleNoUnsafePathJoin } from './rules/guards/no-unsafe-path-join.mjs';
import { rule as ruleNoUnusedDomEnvironment } from './rules/testing/environment/no-unused-dom-environment.mjs';
import { rule as ruleNoUnvalidatedSchemaField } from './rules/boundaries/no-unvalidated-schema-field.mjs';
import { rule as ruleNoWaitForWithFakeTimers } from './rules/testing/assertions/no-wait-for-with-fake-timers.mjs';
import { rule as ruleNoWeakHash } from './rules/security/hash/no-weak-hash.mjs';
import { rule as rulePreserveErrorCause } from './rules/errors/preserve-error-cause.mjs';
import { rule as ruleReactControlledInput } from './rules/react/forms/react-controlled-input.mjs';
import { rule as ruleReactFieldHasLabel } from './rules/react/forms/react-field-has-label.mjs';
import { rule as ruleReactNoDirectDom } from './rules/react/render/react-no-direct-dom.mjs';
import { rule as ruleReactNoEffectDataFetching } from './rules/react/react-no-effect-data-fetching.mjs';
import { rule as ruleReactNoEffectDerivedState } from './rules/react/react-no-effect-derived-state.mjs';
import { rule as ruleReactNoEffectEventHandling } from './rules/react/render/react-no-effect-event-handling.mjs';
import { rule as ruleReactNoHardcodedColors } from './rules/react/theme/react-no-hardcoded-colors.mjs';
import { rule as ruleReactNoRandomKey } from './rules/react/render/react-no-random-key.mjs';
import { rule as ruleReactSingleStylingApproach } from './rules/react/react-single-styling-approach.mjs';
import { rule as ruleReactTestNoImplementationDetails } from './rules/react-tests/react-test-no-implementation-details.mjs';
import { rule as ruleReportModuleLoadEffects } from './rules/modules/report-module-load-effects.mjs';
import { rule as ruleRequireErrorListener } from './rules/events/require-error-listener.mjs';
import { rule as ruleRequireHttpTimeout } from './rules/security/http/require-http-timeout.mjs';
import { rule as ruleRequireProcessTimeout } from './rules/processes/require-process-timeout.mjs';
import { rule as ruleRequireTestProcessTimeout } from './rules/testing/processes/timeouts/require-test-process-timeout.mjs';
import { rule as ruleStrictBooleanExpressions } from './rules/wrapped/strict-boolean-expressions.mjs';
import { rule as ruleStructuredCatchLogging } from './rules/errors/structured-catch-logging.mjs';
import { rule as ruleTestMustUseProductionRuntime } from './rules/testing/assertions/test-must-use-production-runtime.mjs';
import { rule as ruleTestTsconfigPinsLibAndTypes } from './rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';
import { rule as ruleTimeoutAbandonsOperation } from './rules/async/timeout-abandons-operation.mjs';
import { rule as ruleUnboundedFanOut } from './rules/concurrency/unbounded-fan-out.mjs';
import { rule as ruleUnboundedReactiveFanOut } from './rules/concurrency/reactive/unbounded-reactive-fan-out.mjs';

export const directoryRules = {
  'bounded-container-teardown': ruleBoundedContainerTeardown,
  'cognitive-complexity': ruleCognitiveComplexity,
  'container-pause-requires-finally-unpause': ruleContainerPauseRequiresFinallyUnpause,
  'exhaustive-union-predicate': ruleExhaustiveUnionPredicate,
  'fake-timers-require-restore': ruleFakeTimersRequireRestore,
  'file-name-casing': ruleFileNameCasing,
  'hermetic-git-in-tests': ruleHermeticGitInTests,
  'hover-test-needs-keyboard': ruleHoverTestNeedsKeyboard,
  'integration-test-uses-approved-harness': ruleIntegrationTestUsesApprovedHarness,
  'naming-convention': ruleNamingConvention,
  'no-accumulating-spread': ruleNoAccumulatingSpread,
  'no-assertion-in-loop': ruleNoAssertionInLoop,
  'no-branch-in-composition-root': ruleNoBranchInCompositionRoot,
  'no-comments': ruleNoComments,
  'no-compatibility-shim': ruleNoCompatibilityShim,
  'no-copy-pasted-tests': ruleNoCopyPastedTests,
  'no-default-export': ruleNoDefaultExport,
  'no-dev-dependency-in-production': ruleNoDevDependencyInProduction,
  'no-disabled-tls-verification': ruleNoDisabledTlsVerification,
  'no-eager-relation': ruleNoEagerRelation,
  'no-external-executables-in-unit-tests': ruleNoExternalExecutablesInUnitTests,
  'no-falsy-default': ruleNoFalsyDefault,
  'no-first-test-charged-setup': ruleNoFirstTestChargedSetup,
  'no-fixed-sleep-synchronization': ruleNoFixedSleepSynchronization,
  'no-forwarding-wrapper': ruleNoForwardingWrapper,
  'no-git-repository-per-test': ruleNoGitRepositoryPerTest,
  'no-handwritten-boundary-guard': ruleNoHandwrittenBoundaryGuard,
  'no-in-memory-query': ruleNoInMemoryQuery,
  'no-internal-module-mocks': ruleNoInternalModuleMocks,
  'no-interval-polling-in-tests': ruleNoIntervalPollingInTests,
  'no-local-time-zone': ruleNoLocalTimeZone,
  'no-magic-numbers': ruleNoMagicNumbers,
  'no-managed-resource-construction-outside-composition-roots':
    ruleNoManagedResourceConstructionOutsideCompositionRoots,
  'no-many-to-many-cascade-remove': ruleNoManyToManyCascadeRemove,
  'no-mocking-subject-under-test': ruleNoMockingSubjectUnderTest,
  'no-module-level-let': ruleNoModuleLevelLet,
  'no-module-level-mutable-state': ruleNoModuleLevelMutableState,
  'no-mutating-method-in-domain': ruleNoMutatingMethodInDomain,
  'no-node-process-per-test': ruleNoNodeProcessPerTest,
  'no-null': ruleNoNull,
  'no-orm-query-logging': ruleNoOrmQueryLogging,
  'no-orm-schema-sync': ruleNoOrmSchemaSync,
  'no-parameter-mutation': ruleNoParameterMutation,
  'no-partial-output-assertion': ruleNoPartialOutputAssertion,
  'no-process-access-outside-composition-root': ruleNoProcessAccessOutsideCompositionRoot,
  'no-process-globals-outside-main-guard': ruleNoProcessGlobalsOutsideMainGuard,
  'no-production-console': ruleNoProductionConsole,
  'no-production-imports-in-setup-files': ruleNoProductionImportsInSetupFiles,
  'no-promise-chain': ruleNoPromiseChain,
  'no-raised-test-timeout': ruleNoRaisedTestTimeout,
  'no-real-time-random-or-network': ruleNoRealTimeRandomOrNetwork,
  'no-runtime-exclusive-props-check': ruleNoRuntimeExclusivePropsCheck,
  'no-self-recursion': ruleNoSelfRecursion,
  'no-server-or-worker-per-test': ruleNoServerOrWorkerPerTest,
  'no-shared-stateful-regex': ruleNoSharedStatefulRegex,
  'no-shared-test-state': ruleNoSharedTestState,
  'no-shell-string-command': ruleNoShellStringCommand,
  'no-silent-catch': ruleNoSilentCatch,
  'no-singular-and-plural-prop': ruleNoSingularAndPluralProp,
  'no-sql-string-building': ruleNoSqlStringBuilding,
  'no-string-as-regex': ruleNoStringAsRegex,
  'no-switched-off-tests': ruleNoSwitchedOffTests,
  'no-test-helpers-in-source': ruleNoTestHelpersInSource,
  'no-test-retry': ruleNoTestRetry,
  'no-throw': ruleNoThrow,
  'no-tri-state-boolean': ruleNoTriStateBoolean,
  'no-ui-framework-in-domain': ruleNoUiFrameworkInDomain,
  'no-uncollected-tests': ruleNoUncollectedTests,
  'no-unhandled-url-parse': ruleNoUnhandledUrlParse,
  'no-unhandled-void-promise': ruleNoUnhandledVoidPromise,
  'no-unindexed-foreign-key': ruleNoUnindexedForeignKey,
  'no-uninjectable-delay': ruleNoUninjectableDelay,
  'no-unknown-in-domain': ruleNoUnknownInDomain,
  'no-unknown-main-folder': ruleNoUnknownMainFolder,
  'no-unowned-async-assertion': ruleNoUnownedAsyncAssertion,
  'no-unsafe-deserialization': ruleNoUnsafeDeserialization,
  'no-unsafe-path-join': ruleNoUnsafePathJoin,
  'no-unused-dom-environment': ruleNoUnusedDomEnvironment,
  'no-unvalidated-schema-field': ruleNoUnvalidatedSchemaField,
  'no-wait-for-with-fake-timers': ruleNoWaitForWithFakeTimers,
  'no-weak-hash': ruleNoWeakHash,
  'preserve-error-cause': rulePreserveErrorCause,
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
  'report-module-load-effects': ruleReportModuleLoadEffects,
  'require-error-listener': ruleRequireErrorListener,
  'require-http-timeout': ruleRequireHttpTimeout,
  'require-process-timeout': ruleRequireProcessTimeout,
  'require-test-process-timeout': ruleRequireTestProcessTimeout,
  'strict-boolean-expressions': ruleStrictBooleanExpressions,
  'structured-catch-logging': ruleStructuredCatchLogging,
  'test-must-use-production-runtime': ruleTestMustUseProductionRuntime,
  'test-tsconfig-pins-lib-and-types': ruleTestTsconfigPinsLibAndTypes,
  'timeout-abandons-operation': ruleTimeoutAbandonsOperation,
  'unbounded-fan-out': ruleUnboundedFanOut,
  'unbounded-reactive-fan-out': ruleUnboundedReactiveFanOut,
};
