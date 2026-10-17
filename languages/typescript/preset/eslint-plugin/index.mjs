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
import { rule as noUiFrameworkInDomain } from './rules/syntax/no-ui-framework-in-domain.mjs';
import { noDefaultExport, noNull, noPromiseChain } from './rules/syntax/syntax-bans.mjs';
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
import { rule as noUnusedDomEnvironment } from './rules/testing/environment/no-unused-dom-environment.mjs';
import { rule as noPartialOutputAssertion } from './rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as noProcessGlobalsOutsideMainGuard } from './rules/modules/no-process-globals-outside-main-guard.mjs';
import { rule as testTsconfigPinsLibAndTypes } from './rules/testing/types/test-tsconfig-pins-lib-and-types.mjs';
import { rule as exhaustiveUnionPredicate } from './rules/api-shape/exhaustive-union-predicate.mjs';
import { rule as hoverTestNeedsKeyboard } from './rules/react-tests/hover-test-needs-keyboard.mjs';
import { rule as noForwardingWrapper } from './rules/api-shape/no-forwarding-wrapper.mjs';
import { rule as noRuntimeExclusivePropsCheck } from './rules/react-props/no-runtime-exclusive-props-check.mjs';
import { rule as noSingularAndPluralProp } from './rules/react-props/no-singular-and-plural-prop.mjs';
import { rule as reactNoEffectDataFetching } from './rules/react/react-no-effect-data-fetching.mjs';
import { rule as reactNoHardcodedColors } from './rules/react/theme/react-no-hardcoded-colors.mjs';
import { rule as reactNoEffectDerivedState } from './rules/react/react-no-effect-derived-state.mjs';
import { rule as reactSingleStylingApproach } from './rules/react/react-single-styling-approach.mjs';
import { rule as reactControlledInput } from './rules/react/forms/react-controlled-input.mjs';
import { rule as reactFieldHasLabel } from './rules/react/forms/react-field-has-label.mjs';
import { rule as reactNoDirectDom } from './rules/react/render/react-no-direct-dom.mjs';
import { rule as reactNoEffectEventHandling } from './rules/react/render/react-no-effect-event-handling.mjs';
import { rule as reactNoRandomKey } from './rules/react/render/react-no-random-key.mjs';
import { rule as reactTestNoImplementationDetails } from './rules/react-tests/react-test-no-implementation-details.mjs';

import { rule as noModuleLevelMutableState } from './rules/guards/no-module-level-mutable-state.mjs';
import { rule as noProcessAccessOutsideCompositionRoot } from './rules/guards/no-process-access-outside-composition-root.mjs';
import { rule as noShellStringCommand } from './rules/guards/no-shell-string-command.mjs';
import { rule as noDisabledTlsVerification } from './rules/security/tls/no-disabled-tls-verification.mjs';
import { rule as noSqlStringBuilding } from './rules/security/sql/no-sql-string-building.mjs';
import { rule as noUnsafeDeserialization } from './rules/security/deserialization/no-unsafe-deserialization.mjs';
import { rule as noWeakHash } from './rules/security/hash/no-weak-hash.mjs';
import { rule as requireHttpTimeout } from './rules/security/http/require-http-timeout.mjs';
import { rule as noUnknownMainFolder } from './rules/guards/no-unknown-main-folder.mjs';
import { rule as noUnsafePathJoin } from './rules/guards/no-unsafe-path-join.mjs';
import { rule as noMagicNumbers } from './rules/wrapped/no-magic-numbers.mjs';
import { rule as namingConvention } from './rules/wrapped/naming-convention.mjs';

export const nitpickerRules = {
  meta: {
    name: 'nitpicker',
    version: '0.1.0',
  },
  rules: {
    'no-default-export': noDefaultExport,
    'no-ui-framework-in-domain': noUiFrameworkInDomain,
    'no-null': noNull,
    'no-promise-chain': noPromiseChain,
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
    'no-module-level-mutable-state': noModuleLevelMutableState,
    'no-process-access-outside-composition-root': noProcessAccessOutsideCompositionRoot,
    'no-shell-string-command': noShellStringCommand,
    'no-disabled-tls-verification': noDisabledTlsVerification,
    'no-sql-string-building': noSqlStringBuilding,
    'no-unsafe-deserialization': noUnsafeDeserialization,
    'no-weak-hash': noWeakHash,
    'require-http-timeout': requireHttpTimeout,
    'no-unknown-main-folder': noUnknownMainFolder,
    'no-magic-numbers': noMagicNumbers,
    'naming-convention': namingConvention,
    'no-unsafe-path-join': noUnsafePathJoin,
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
    'no-unused-dom-environment': noUnusedDomEnvironment,
    'no-process-globals-outside-main-guard': noProcessGlobalsOutsideMainGuard,
    'test-tsconfig-pins-lib-and-types': testTsconfigPinsLibAndTypes,
    'exhaustive-union-predicate': exhaustiveUnionPredicate,
    'hover-test-needs-keyboard': hoverTestNeedsKeyboard,
    'no-forwarding-wrapper': noForwardingWrapper,
    'no-runtime-exclusive-props-check': noRuntimeExclusivePropsCheck,
    'no-singular-and-plural-prop': noSingularAndPluralProp,
    'react-no-effect-data-fetching': reactNoEffectDataFetching,
    'react-no-effect-derived-state': reactNoEffectDerivedState,
    'react-no-hardcoded-colors': reactNoHardcodedColors,
    'react-single-styling-approach': reactSingleStylingApproach,
    'react-controlled-input': reactControlledInput,
    'react-field-has-label': reactFieldHasLabel,
    'react-no-direct-dom': reactNoDirectDom,
    'react-no-effect-event-handling': reactNoEffectEventHandling,
    'react-no-random-key': reactNoRandomKey,
    'react-test-no-implementation-details': reactTestNoImplementationDetails,
  },
};
