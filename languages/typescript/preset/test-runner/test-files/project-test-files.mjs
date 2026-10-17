import { resolveLayoutFor } from '../../layout.mjs';
import { runnerChoiceNotices } from '../detect-runner.mjs';
import { runnerTypesNotices } from '../runner-types.mjs';
import { runnerTestFileFacts } from './runner-test-files.mjs';

function usesPresetAnalyzers(analyzers) {
  return analyzers.some((analyzer) => analyzer.policyFromPackage === true);
}

export function withProjectTestFiles(policy, { projectRoot, liveProjectRoot, analyzers }) {
  const tests = policy.tools?.tests;
  if (tests === undefined || !usesPresetAnalyzers(analyzers)) {
    return policy;
  }
  const choice = runnerChoiceNotices(tests, analyzers);
  const facts = runnerTestFileFacts(projectRoot, {
    configured: tests.runner ?? tests.detectedRunner,
    layout: resolveLayoutFor(policy),
    liveProjectRoot,
  });
  const notices = [
    ...choice,
    ...(facts.notices ?? []),
    ...runnerTypesNotices(tests.runner ?? tests.detectedRunner, {
      projectDirectory: projectRoot,
      analyzers,
    }),
  ];
  const recorded = {
    ...tests,
    testFiles: facts.testFiles,
    ...(facts.domEnvironment === true ? { domEnvironment: true } : {}),
    ...(notices.length === 0 ? {} : { notices }),
  };
  return { ...policy, tools: { ...policy.tools, tests: recorded } };
}
