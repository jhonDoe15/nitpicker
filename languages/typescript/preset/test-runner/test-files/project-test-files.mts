import { resolveLayoutFor } from '../../layout.mts';
import { fieldOf, fieldsOf, optionalText } from '../../../../../shared/values/readers.mts';
import { runnerChoiceNotices } from '../detect-runner.mts';
import { runnerTypesNotices } from '../vocabulary/runner-types.mts';
import { runnerTestFileFacts } from './runner-test-files.mts';

type PresetAnalyzer = { readonly name: string; readonly policyFromPackage?: unknown };

type ProjectFilesRequest = {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly analyzers: readonly PresetAnalyzer[];
};

function usesPresetAnalyzers(analyzers: readonly PresetAnalyzer[]): boolean {
  return analyzers.some((analyzer) => analyzer.policyFromPackage === true);
}

export function withProjectTestFiles<Policy extends Readonly<Record<string, unknown>>>(
  policy: Policy,
  { projectRoot, liveProjectRoot, analyzers }: ProjectFilesRequest,
): Policy {
  const tools = fieldOf(policy, 'tools');
  const tests = fieldOf(tools, 'tests');
  if (tests === undefined || !usesPresetAnalyzers(analyzers)) {
    return policy;
  }
  const detected = optionalText(fieldOf(tests, 'detectedRunner'));
  const runner = optionalText(fieldOf(tests, 'runner'));
  const choice = runnerChoiceNotices(
    {
      runnerAmbiguity: optionalText(fieldOf(tests, 'runnerAmbiguity')),
      detectedRunner: detected,
    },
    analyzers,
  );
  const facts = runnerTestFileFacts(projectRoot, {
    configured: runner ?? detected,
    layout: resolveLayoutFor(policy),
    liveProjectRoot,
  });
  const notices = [
    ...choice,
    ...(facts.notices ?? []),
    ...runnerTypesNotices(runner ?? detected, {
      projectDirectory: projectRoot,
      analyzers,
    }),
  ];
  const recorded = {
    ...fieldsOf(tests),
    testFiles: facts.testFiles,
    ...(facts.domEnvironment ? { domEnvironment: true } : {}),
    ...(notices.length === 0 ? {} : { notices }),
  };
  return { ...policy, tools: { ...fieldsOf(tools), tests: recorded } };
}
