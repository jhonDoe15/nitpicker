import { rule as integrationTestUsesApprovedHarness } from './rules/testing/processes/integration-test-uses-approved-harness.mjs';
import { rule as containerPauseRequiresFinallyUnpause } from './rules/testing/lifecycle/container-pause-requires-finally-unpause.mjs';
import { rule as boundedContainerTeardown } from './rules/testing/lifecycle/bounded-container-teardown.mjs';
import { rule as noFixedSleepSynchronization } from './rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { rule as noIntervalPollingInTests } from './rules/testing/lifecycle/no-interval-polling-in-tests.mjs';
import { rule as noManagedResourceConstructionOutsideCompositionRoots } from './rules/boundaries/no-managed-resource-construction-outside-composition-roots.mjs';
import { rule as noBranchInCompositionRoot } from './rules/boundaries/no-branch-in-composition-root.mjs';
import { rule as noHandwrittenBoundaryGuard } from './rules/boundaries/no-handwritten-boundary-guard.mjs';
import { rule as noModuleLevelLet } from './rules/modules/no-module-level-let.mjs';
import { rule as noMockingSubjectUnderTest } from './rules/testing/assertions/no-mocking-subject-under-test.mjs';
import { rule as cognitiveComplexity } from './rules/analysis/cognitive-complexity.mjs';
import { rule as noComments } from './rules/modules/no-comments.mjs';
import { rule as noProductionConsole } from './rules/modules/no-production-console.mjs';
import { rule as noSelfRecursion } from './rules/control/no-self-recursion.mjs';
import { rule as noSilentCatch } from './rules/errors/no-silent-catch.mjs';
import { rule as noThrow } from './rules/errors/no-throw.mjs';
import { rule as noUnknownInDomain } from './rules/boundaries/no-unknown-in-domain.mjs';
import { rule as noMutatingMethodInDomain } from './rules/domain/no-mutating-method-in-domain.mjs';
import { rule as noUnvalidatedSchemaField } from './rules/boundaries/no-unvalidated-schema-field.mjs';
import { rule as reportModuleLoadEffects } from './rules/modules/report-module-load-effects.mjs';
import { rule as structuredCatchLogging } from './rules/errors/structured-catch-logging.mjs';
import { rule as testMustUseProductionRuntime } from './rules/testing/assertions/test-must-use-production-runtime.mjs';
import { rule as noWaitForWithFakeTimers } from './rules/testing/assertions/no-wait-for-with-fake-timers.mjs';
import { rule as preserveErrorCause } from './rules/errors/preserve-error-cause.mjs';
import { rule as noInternalModuleMocks } from './rules/testing/assertions/no-internal-module-mocks.mjs';
import { rule as noExternalExecutables } from './rules/testing/processes/no-external-executables-in-unit-tests.mjs';
import { rule as noFirstTestChargedSetup } from './rules/testing/lifecycle/no-first-test-charged-setup.mjs';
import { rule as noUninjectableDelay } from './rules/testing/lifecycle/no-uninjectable-delay.mjs';
import { rule as noGitRepositoryPerTest } from './rules/testing/processes/no-git-repository-per-test.mjs';
import { rule as hermeticGitInTests } from './rules/testing/processes/hermetic-git-in-tests.mjs';
import { rule as noNodeProcessPerTest } from './rules/testing/processes/no-node-process-per-test.mjs';
import { rule as noServerOrWorkerPerTest } from './rules/testing/processes/no-server-or-worker-per-test.mjs';
import { rule as noRaisedTestTimeout } from './rules/testing/assertions/no-raised-test-timeout.mjs';
import { rule as noPartialOutputAssertion } from './rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as noProcessGlobalsOutsideMainGuard } from './rules/modules/no-process-globals-outside-main-guard.mjs';
import { rule as testTsconfigPinsLibAndTypes } from './rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';
import { rule as reactNoEffectDataFetching } from './rules/react/react-no-effect-data-fetching.mjs';
import { rule as reactNoHardcodedColors } from './rules/react/theme/react-no-hardcoded-colors.mjs';
import { rule as reactNoEffectDerivedState } from './rules/react/react-no-effect-derived-state.mjs';
import { rule as reactSingleStylingApproach } from './rules/react/react-single-styling-approach.mjs';
import { rule as reactTestNoImplementationDetails } from './rules/react/react-test-no-implementation-details.mjs';

export const nitpickerRules = {
  meta: {
    name: 'nitpicker',
    version: '0.1.0',
  },
  rules: {
    'container-pause-requires-finally-unpause': containerPauseRequiresFinallyUnpause,
    'bounded-container-teardown': boundedContainerTeardown,
    'no-fixed-sleep-synchronization': noFixedSleepSynchronization,
    'no-interval-polling-in-tests': noIntervalPollingInTests,
    'no-external-executables-in-unit-tests': noExternalExecutables,
    'no-wait-for-with-fake-timers': noWaitForWithFakeTimers,
    'preserve-error-cause': preserveErrorCause,
    'no-internal-module-mocks': noInternalModuleMocks,
    'integration-test-uses-approved-harness': integrationTestUsesApprovedHarness,
    'no-branch-in-composition-root': noBranchInCompositionRoot,
    'no-handwritten-boundary-guard': noHandwrittenBoundaryGuard,
    'no-managed-resource-construction-outside-composition-roots':
      noManagedResourceConstructionOutsideCompositionRoots,
    'no-module-level-let': noModuleLevelLet,
    'no-mocking-subject-under-test': noMockingSubjectUnderTest,
    'cognitive-complexity': cognitiveComplexity,
    'no-comments': noComments,
    'no-production-console': noProductionConsole,
    'no-self-recursion': noSelfRecursion,
    'no-silent-catch': noSilentCatch,
    'no-throw': noThrow,
    'no-unknown-in-domain': noUnknownInDomain,
    'no-mutating-method-in-domain': noMutatingMethodInDomain,
    'no-unvalidated-schema-field': noUnvalidatedSchemaField,
    'report-module-load-effects': reportModuleLoadEffects,
    'structured-catch-logging': structuredCatchLogging,
    'test-must-use-production-runtime': testMustUseProductionRuntime,
    'no-first-test-charged-setup': noFirstTestChargedSetup,
    'no-uninjectable-delay': noUninjectableDelay,
    'no-git-repository-per-test': noGitRepositoryPerTest,
    'hermetic-git-in-tests': hermeticGitInTests,
    'no-node-process-per-test': noNodeProcessPerTest,
    'no-server-or-worker-per-test': noServerOrWorkerPerTest,
    'no-raised-test-timeout': noRaisedTestTimeout,
    'no-partial-output-assertion': noPartialOutputAssertion,
    'no-process-globals-outside-main-guard': noProcessGlobalsOutsideMainGuard,
    'test-tsconfig-pins-lib-and-types': testTsconfigPinsLibAndTypes,
    'react-no-effect-data-fetching': reactNoEffectDataFetching,
    'react-no-effect-derived-state': reactNoEffectDerivedState,
    'react-no-hardcoded-colors': reactNoHardcodedColors,
    'react-single-styling-approach': reactSingleStylingApproach,
    'react-test-no-implementation-details': reactTestNoImplementationDetails,
  },
};
