import { rule as boundedContainerTeardown } from './rules/testing/lifecycle/bounded-container-teardown.mjs';
import { rule as cognitiveComplexity } from './rules/analysis/cognitive-complexity.mjs';
import { rule as containerPauseRequiresFinallyUnpause } from './rules/testing/lifecycle/container-pause-requires-finally-unpause.mjs';
import { rule as exhaustiveUnionPredicate } from './rules/api-shape/exhaustive-union-predicate.mjs';
import { rule as fakeTimersRequireRestore } from './test-quality/fake-timers-require-restore.mjs';
import { rule as fileNameCasing } from './rules/naming/file-name-casing.mjs';
import { rule as hermeticGitInTests } from './rules/testing/processes/hermetic-git-in-tests.mjs';
import { rule as hoverTestNeedsKeyboard } from './rules/react-tests/hover-test-needs-keyboard.mjs';
import { rule as integrationTestUsesApprovedHarness } from './rules/testing/processes/integration-test-uses-approved-harness.mjs';
import { rule as namingConvention } from './rules/wrapped/naming-convention.mjs';
import { rule as noAccumulatingSpread } from './rules/collections/no-accumulating-spread.mjs';
import { rule as noAssertionInLoop } from './test-assertions/loop-assertions/no-assertion-in-loop.mjs';
import { rule as noBranchInCompositionRoot } from './rules/boundaries/no-branch-in-composition-root.mjs';
import { rule as noComments } from './rules/modules/no-comments.mjs';
import { rule as noCompatibilityShim } from './rules/signatures/no-compatibility-shim.mjs';
import { rule as noCopyPastedTests } from './test-quality/no-copy-pasted-tests.mjs';
import { rule as noDefaultExport } from './rules/syntax/no-default-export.mjs';
import { rule as noDevDependencyInProduction } from './rules/dependencies/no-dev-dependency-in-production.mjs';
import { rule as noDisabledTlsVerification } from './rules/security/tls/no-disabled-tls-verification.mjs';
import { rule as noEagerRelation } from './rules/persistence/no-eager-relation.mjs';
import { rule as noExternalExecutablesInUnitTests } from './rules/testing/processes/no-external-executables-in-unit-tests.mjs';
import { rule as noFalsyDefault } from './rules/signatures/no-falsy-default.mjs';
import { rule as noFirstTestChargedSetup } from './rules/testing/lifecycle/no-first-test-charged-setup.mjs';
import { rule as noFixedSleepSynchronization } from './rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { rule as noForwardingWrapper } from './rules/api-shape/no-forwarding-wrapper.mjs';
import { rule as noGitRepositoryPerTest } from './rules/testing/processes/no-git-repository-per-test.mjs';
import { rule as noHandwrittenBoundaryGuard } from './rules/boundaries/no-handwritten-boundary-guard.mjs';
import { rule as noInternalModuleMocks } from './rules/testing/assertions/no-internal-module-mocks.mjs';
import { rule as noIntervalPollingInTests } from './rules/testing/lifecycle/no-interval-polling-in-tests.mjs';
import { rule as noLocalTimeZone } from './rules/time/no-local-time-zone.mjs';
import { rule as noMagicNumbers } from './rules/wrapped/no-magic-numbers.mjs';
import { rule as noManagedResourceConstructionOutsideCompositionRoots } from './rules/boundaries/no-managed-resource-construction-outside-composition-roots.mjs';
import { rule as noManyToManyCascadeRemove } from './rules/persistence/no-many-to-many-cascade-remove.mjs';
import { rule as noMockingSubjectUnderTest } from './rules/testing/assertions/no-mocking-subject-under-test.mjs';
import { rule as noModuleLevelLet } from './rules/modules/no-module-level-let.mjs';
import { rule as noModuleLevelMutableState } from './rules/guards/no-module-level-mutable-state.mjs';
import { rule as noMutatingMethodInDomain } from './rules/domain/no-mutating-method-in-domain.mjs';
import { rule as noNodeProcessPerTest } from './rules/testing/processes/no-node-process-per-test.mjs';
import { rule as noNull } from './rules/syntax/no-null.mjs';
import { rule as noOrmQueryLogging } from './rules/database/no-orm-query-logging.mjs';
import { rule as noOrmSchemaSync } from './rules/database/no-orm-schema-sync.mjs';
import { rule as noParameterMutation } from './rules/signatures/no-parameter-mutation.mjs';
import { rule as noPartialOutputAssertion } from './rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as noProcessAccessOutsideCompositionRoot } from './rules/guards/no-process-access-outside-composition-root.mjs';
import { rule as noProcessGlobalsOutsideMainGuard } from './rules/modules/no-process-globals-outside-main-guard.mjs';
import { rule as noProductionConsole } from './rules/modules/no-production-console.mjs';
import { rule as noProductionImportsInSetupFiles } from './test-isolation/no-production-imports-in-setup-files.mjs';
import { rule as noPromiseChain } from './rules/syntax/no-promise-chain.mjs';
import { rule as noRaisedTestTimeout } from './rules/testing/assertions/no-raised-test-timeout.mjs';
import { rule as noRealTimeRandomOrNetwork } from './test-isolation/no-real-time-random-or-network.mjs';
import { rule as noRuntimeExclusivePropsCheck } from './rules/react-props/no-runtime-exclusive-props-check.mjs';
import { rule as noSelfRecursion } from './rules/control/no-self-recursion.mjs';
import { rule as noServerOrWorkerPerTest } from './rules/testing/processes/no-server-or-worker-per-test.mjs';
import { rule as noSharedStatefulRegex } from './rules/regex/no-shared-stateful-regex.mjs';
import { rule as noSharedTestState } from './test-quality/no-shared-test-state.mjs';
import { rule as noShellStringCommand } from './rules/guards/no-shell-string-command.mjs';
import { rule as noSilentCatch } from './rules/errors/no-silent-catch.mjs';
import { rule as noSingularAndPluralProp } from './rules/api-shape/no-singular-and-plural-prop.mjs';
import { rule as noSqlStringBuilding } from './rules/security/sql/no-sql-string-building.mjs';
import { rule as noStringAsRegex } from './rules/regex/no-string-as-regex.mjs';
import { rule as noSwitchedOffTests } from './test-assertions/no-switched-off-tests.mjs';
import { rule as noTestHelpersInSource } from './test-placement/no-test-helpers-in-source.mjs';
import { rule as noTestRetry } from './test-assertions/no-test-retry.mjs';
import { rule as noThrow } from './rules/errors/no-throw.mjs';
import { rule as noTriStateBoolean } from './rules/signatures/no-tri-state-boolean.mjs';
import { rule as noUiFrameworkInDomain } from './rules/syntax/no-ui-framework-in-domain.mjs';
import { rule as noUncollectedTests } from './test-isolation/no-uncollected-tests.mjs';
import { rule as noUnhandledUrlParse } from './rules/parsing/no-unhandled-url-parse.mjs';
import { rule as noUnhandledVoidPromise } from './rules/promises/no-unhandled-void-promise.mjs';
import { rule as noUninjectableDelay } from './rules/testing/lifecycle/no-uninjectable-delay.mjs';
import { rule as noUnknownInDomain } from './rules/boundaries/no-unknown-in-domain.mjs';
import { rule as noUnknownMainFolder } from './rules/guards/no-unknown-main-folder.mjs';
import { rule as noUnownedAsyncAssertion } from './test-assertions/unowned-async/no-unowned-async-assertion.mjs';
import { rule as noUnsafeDeserialization } from './rules/security/deserialization/no-unsafe-deserialization.mjs';
import { rule as noUnsafePathJoin } from './rules/guards/no-unsafe-path-join.mjs';
import { rule as noUnusedDomEnvironment } from './rules/testing/environment/no-unused-dom-environment.mjs';
import { rule as noUnvalidatedSchemaField } from './rules/boundaries/no-unvalidated-schema-field.mjs';
import { rule as noWaitForWithFakeTimers } from './rules/testing/assertions/no-wait-for-with-fake-timers.mjs';
import { rule as noWeakHash } from './rules/security/hash/no-weak-hash.mjs';
import { rule as preserveErrorCause } from './rules/errors/preserve-error-cause.mjs';
import { rule as reactControlledInput } from './rules/react/forms/react-controlled-input.mjs';
import { rule as reactFieldHasLabel } from './rules/react/forms/react-field-has-label.mjs';
import { rule as reactNoDirectDom } from './rules/react/render/react-no-direct-dom.mjs';
import { rule as reactNoEffectDataFetching } from './rules/react/react-no-effect-data-fetching.mjs';
import { rule as reactNoEffectDerivedState } from './rules/react/react-no-effect-derived-state.mjs';
import { rule as reactNoEffectEventHandling } from './rules/react/render/react-no-effect-event-handling.mjs';
import { rule as reactNoHardcodedColors } from './rules/react/theme/react-no-hardcoded-colors.mjs';
import { rule as reactNoRandomKey } from './rules/react/render/react-no-random-key.mjs';
import { rule as reactSingleStylingApproach } from './rules/react/react-single-styling-approach.mjs';
import { rule as reactTestNoImplementationDetails } from './rules/react-tests/react-test-no-implementation-details.mjs';
import { rule as reportModuleLoadEffects } from './rules/modules/report-module-load-effects.mjs';
import { rule as requireErrorListener } from './rules/events/require-error-listener.mjs';
import { rule as requireHttpTimeout } from './rules/security/http/require-http-timeout.mjs';
import { rule as requireProcessTimeout } from './rules/processes/require-process-timeout.mjs';
import { rule as requireTestProcessTimeout } from './rules/testing/processes/timeouts/require-test-process-timeout.mjs';
import { rule as structuredCatchLogging } from './rules/errors/structured-catch-logging.mjs';
import { rule as testMustUseProductionRuntime } from './rules/testing/assertions/test-must-use-production-runtime.mjs';
import { rule as testTsconfigPinsLibAndTypes } from './rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';
import { rule as unboundedFanOut } from './rules/concurrency/unbounded-fan-out.mjs';
import { rule as unboundedReactiveFanOut } from './rules/concurrency/reactive/unbounded-reactive-fan-out.mjs';

export const directoryRules = {
  'bounded-container-teardown': boundedContainerTeardown,
  'cognitive-complexity': cognitiveComplexity,
  'container-pause-requires-finally-unpause': containerPauseRequiresFinallyUnpause,
  'exhaustive-union-predicate': exhaustiveUnionPredicate,
  'fake-timers-require-restore': fakeTimersRequireRestore,
  'file-name-casing': fileNameCasing,
  'hermetic-git-in-tests': hermeticGitInTests,
  'hover-test-needs-keyboard': hoverTestNeedsKeyboard,
  'integration-test-uses-approved-harness': integrationTestUsesApprovedHarness,
  'naming-convention': namingConvention,
  'no-accumulating-spread': noAccumulatingSpread,
  'no-assertion-in-loop': noAssertionInLoop,
  'no-branch-in-composition-root': noBranchInCompositionRoot,
  'no-comments': noComments,
  'no-compatibility-shim': noCompatibilityShim,
  'no-copy-pasted-tests': noCopyPastedTests,
  'no-default-export': noDefaultExport,
  'no-dev-dependency-in-production': noDevDependencyInProduction,
  'no-disabled-tls-verification': noDisabledTlsVerification,
  'no-eager-relation': noEagerRelation,
  'no-external-executables-in-unit-tests': noExternalExecutablesInUnitTests,
  'no-falsy-default': noFalsyDefault,
  'no-first-test-charged-setup': noFirstTestChargedSetup,
  'no-fixed-sleep-synchronization': noFixedSleepSynchronization,
  'no-forwarding-wrapper': noForwardingWrapper,
  'no-git-repository-per-test': noGitRepositoryPerTest,
  'no-handwritten-boundary-guard': noHandwrittenBoundaryGuard,
  'no-internal-module-mocks': noInternalModuleMocks,
  'no-interval-polling-in-tests': noIntervalPollingInTests,
  'no-local-time-zone': noLocalTimeZone,
  'no-magic-numbers': noMagicNumbers,
  'no-managed-resource-construction-outside-composition-roots':
    noManagedResourceConstructionOutsideCompositionRoots,
  'no-many-to-many-cascade-remove': noManyToManyCascadeRemove,
  'no-mocking-subject-under-test': noMockingSubjectUnderTest,
  'no-module-level-let': noModuleLevelLet,
  'no-module-level-mutable-state': noModuleLevelMutableState,
  'no-mutating-method-in-domain': noMutatingMethodInDomain,
  'no-node-process-per-test': noNodeProcessPerTest,
  'no-null': noNull,
  'no-orm-query-logging': noOrmQueryLogging,
  'no-orm-schema-sync': noOrmSchemaSync,
  'no-parameter-mutation': noParameterMutation,
  'no-partial-output-assertion': noPartialOutputAssertion,
  'no-process-access-outside-composition-root': noProcessAccessOutsideCompositionRoot,
  'no-process-globals-outside-main-guard': noProcessGlobalsOutsideMainGuard,
  'no-production-console': noProductionConsole,
  'no-production-imports-in-setup-files': noProductionImportsInSetupFiles,
  'no-promise-chain': noPromiseChain,
  'no-raised-test-timeout': noRaisedTestTimeout,
  'no-real-time-random-or-network': noRealTimeRandomOrNetwork,
  'no-runtime-exclusive-props-check': noRuntimeExclusivePropsCheck,
  'no-self-recursion': noSelfRecursion,
  'no-server-or-worker-per-test': noServerOrWorkerPerTest,
  'no-shared-stateful-regex': noSharedStatefulRegex,
  'no-shared-test-state': noSharedTestState,
  'no-shell-string-command': noShellStringCommand,
  'no-silent-catch': noSilentCatch,
  'no-singular-and-plural-prop': noSingularAndPluralProp,
  'no-sql-string-building': noSqlStringBuilding,
  'no-string-as-regex': noStringAsRegex,
  'no-switched-off-tests': noSwitchedOffTests,
  'no-test-helpers-in-source': noTestHelpersInSource,
  'no-test-retry': noTestRetry,
  'no-throw': noThrow,
  'no-tri-state-boolean': noTriStateBoolean,
  'no-ui-framework-in-domain': noUiFrameworkInDomain,
  'no-uncollected-tests': noUncollectedTests,
  'no-unhandled-url-parse': noUnhandledUrlParse,
  'no-unhandled-void-promise': noUnhandledVoidPromise,
  'no-uninjectable-delay': noUninjectableDelay,
  'no-unknown-in-domain': noUnknownInDomain,
  'no-unknown-main-folder': noUnknownMainFolder,
  'no-unowned-async-assertion': noUnownedAsyncAssertion,
  'no-unsafe-deserialization': noUnsafeDeserialization,
  'no-unsafe-path-join': noUnsafePathJoin,
  'no-unused-dom-environment': noUnusedDomEnvironment,
  'no-unvalidated-schema-field': noUnvalidatedSchemaField,
  'no-wait-for-with-fake-timers': noWaitForWithFakeTimers,
  'no-weak-hash': noWeakHash,
  'preserve-error-cause': preserveErrorCause,
  'react-controlled-input': reactControlledInput,
  'react-field-has-label': reactFieldHasLabel,
  'react-no-direct-dom': reactNoDirectDom,
  'react-no-effect-data-fetching': reactNoEffectDataFetching,
  'react-no-effect-derived-state': reactNoEffectDerivedState,
  'react-no-effect-event-handling': reactNoEffectEventHandling,
  'react-no-hardcoded-colors': reactNoHardcodedColors,
  'react-no-random-key': reactNoRandomKey,
  'react-single-styling-approach': reactSingleStylingApproach,
  'react-test-no-implementation-details': reactTestNoImplementationDetails,
  'report-module-load-effects': reportModuleLoadEffects,
  'require-error-listener': requireErrorListener,
  'require-http-timeout': requireHttpTimeout,
  'require-process-timeout': requireProcessTimeout,
  'require-test-process-timeout': requireTestProcessTimeout,
  'structured-catch-logging': structuredCatchLogging,
  'test-must-use-production-runtime': testMustUseProductionRuntime,
  'test-tsconfig-pins-lib-and-types': testTsconfigPinsLibAndTypes,
  'unbounded-fan-out': unboundedFanOut,
  'unbounded-reactive-fan-out': unboundedReactiveFanOut,
};
