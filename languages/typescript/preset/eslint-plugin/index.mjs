import { rule as integrationTestUsesApprovedHarness } from './rules/integration-test-uses-approved-harness.mjs';
import { rule as containerPauseRequiresFinallyUnpause } from './rules/container-pause-requires-finally-unpause.mjs';
import { rule as boundedContainerTeardown } from './rules/bounded-container-teardown.mjs';
import { rule as noFixedSleepSynchronization } from './rules/no-fixed-sleep-synchronization.mjs';
import { rule as noIntervalPollingInTests } from './rules/no-interval-polling-in-tests.mjs';
import { rule as noManagedResourceConstructionOutsideCompositionRoots } from './rules/no-managed-resource-construction-outside-composition-roots.mjs';
import { rule as noBranchInCompositionRoot } from './rules/no-branch-in-composition-root.mjs';
import { rule as noHandwrittenBoundaryGuard } from './rules/no-handwritten-boundary-guard.mjs';
import { rule as noModuleLevelLet } from './rules/no-module-level-let.mjs';
import { rule as noMockingSubjectUnderTest } from './rules/no-mocking-subject-under-test.mjs';
import { rule as noComments } from './rules/no-comments.mjs';
import { rule as noProductionConsole } from './rules/no-production-console.mjs';
import { rule as noSelfRecursion } from './rules/no-self-recursion.mjs';
import { rule as noSilentCatch } from './rules/no-silent-catch.mjs';
import { rule as noThrow } from './rules/no-throw.mjs';
import { rule as noUnknownInDomain } from './rules/no-unknown-in-domain.mjs';
import { rule as noUnvalidatedSchemaField } from './rules/no-unvalidated-schema-field.mjs';
import { rule as reportModuleLoadEffects } from './rules/report-module-load-effects.mjs';
import { rule as structuredCatchLogging } from './rules/structured-catch-logging.mjs';
import { rule as testMustUseProductionRuntime } from './rules/test-must-use-production-runtime.mjs';
import { rule as noWaitForWithFakeTimers } from './rules/no-wait-for-with-fake-timers.mjs';
import { rule as preserveErrorCause } from './rules/preserve-error-cause.mjs';
import { rule as noInternalModuleMocks } from './rules/no-internal-module-mocks.mjs';
import { rule as noExternalExecutables } from './rules/no-external-executables-in-unit-tests.mjs';
import { rule as noFirstTestChargedSetup } from './rules/no-first-test-charged-setup.mjs';
import { rule as noUninjectableDelay } from './rules/no-uninjectable-delay.mjs';
import { rule as noGitRepositoryPerTest } from './rules/no-git-repository-per-test.mjs';
import { rule as hermeticGitInTests } from './rules/hermetic-git-in-tests.mjs';
import { rule as noNodeProcessPerTest } from './rules/no-node-process-per-test.mjs';
import { rule as noServerOrWorkerPerTest } from './rules/no-server-or-worker-per-test.mjs';
import { rule as noRaisedTestTimeout } from './rules/no-raised-test-timeout.mjs';
import { rule as noPartialOutputAssertion } from './rules/no-partial-output-assertion.mjs';
import { rule as noProcessGlobalsOutsideMainGuard } from './rules/no-process-globals-outside-main-guard.mjs';
import { rule as testTsconfigPinsLibAndTypes } from './rules/test-tsconfig-pins-lib-and-types.mjs';
import { rule as reactNoEffectDataFetching } from './rules/react-no-effect-data-fetching.mjs';
import { rule as reactNoEffectDerivedState } from './rules/react-no-effect-derived-state.mjs';
import { rule as reactSingleStylingApproach } from './rules/react-single-styling-approach.mjs';

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
    'no-comments': noComments,
    'no-production-console': noProductionConsole,
    'no-self-recursion': noSelfRecursion,
    'no-silent-catch': noSilentCatch,
    'no-throw': noThrow,
    'no-unknown-in-domain': noUnknownInDomain,
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
    'react-single-styling-approach': reactSingleStylingApproach,
  },
};
