import integrationTestUsesApprovedHarness from './rules/integration-test-uses-approved-harness.mjs';
import containerPauseRequiresFinallyUnpause from './rules/container-pause-requires-finally-unpause.mjs';
import boundedContainerTeardown from './rules/bounded-container-teardown.mjs';
import noFixedSleepSynchronization from './rules/no-fixed-sleep-synchronization.mjs';
import noIntervalPollingInTests from './rules/no-interval-polling-in-tests.mjs';
import noManagedResourceConstructionOutsideCompositionRoots from './rules/no-managed-resource-construction-outside-composition-roots.mjs';
import noHandwrittenBoundaryGuard from './rules/no-handwritten-boundary-guard.mjs';
import noModuleLevelLet from './rules/no-module-level-let.mjs';
import noMockingSubjectUnderTest from './rules/no-mocking-subject-under-test.mjs';
import noComments from './rules/no-comments.mjs';
import noProductionConsole from './rules/no-production-console.mjs';
import noSelfRecursion from './rules/no-self-recursion.mjs';
import noSilentCatch from './rules/no-silent-catch.mjs';
import noThrow from './rules/no-throw.mjs';
import reportModuleLoadEffects from './rules/report-module-load-effects.mjs';
import structuredCatchLogging from './rules/structured-catch-logging.mjs';
import testMustUseProductionRuntime from './rules/test-must-use-production-runtime.mjs';
import noWaitForWithFakeTimers from './rules/no-wait-for-with-fake-timers.mjs';
import preserveErrorCause from './rules/preserve-error-cause.mjs';
import noInternalModuleMocks from './rules/no-internal-module-mocks.mjs';
import noExternalExecutables from './rules/no-external-executables-in-unit-tests.mjs';
import noFirstTestChargedSetup from './rules/no-first-test-charged-setup.mjs';
import noUninjectableDelay from './rules/no-uninjectable-delay.mjs';
import noGitRepositoryPerTest from './rules/no-git-repository-per-test.mjs';
import hermeticGitInTests from './rules/hermetic-git-in-tests.mjs';
import noNodeProcessPerTest from './rules/no-node-process-per-test.mjs';
import noServerOrWorkerPerTest from './rules/no-server-or-worker-per-test.mjs';
import noRaisedTestTimeout from './rules/no-raised-test-timeout.mjs';
import noProcessGlobalsOutsideMainGuard from './rules/no-process-globals-outside-main-guard.mjs';
import testTsconfigPinsLibAndTypes from './rules/test-tsconfig-pins-lib-and-types.mjs';

export default {
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
    'no-handwritten-boundary-guard': noHandwrittenBoundaryGuard,
    'no-managed-resource-construction-outside-composition-roots':
      noManagedResourceConstructionOutsideCompositionRoots,
    'no-module-level-let': noModuleLevelLet,
    'no-mocking-subject-under-test': noMockingSubjectUnderTest,
    'no-comments': noComments,
    'no-production-console': noProductionConsole,
    'no-self-recursion': noSelfRecursion,
    'no-silent-catch': noSilentCatch,
    'no-throw': noThrow,
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
    'no-process-globals-outside-main-guard': noProcessGlobalsOutsideMainGuard,
    'test-tsconfig-pins-lib-and-types': testTsconfigPinsLibAndTypes,
  },
};
