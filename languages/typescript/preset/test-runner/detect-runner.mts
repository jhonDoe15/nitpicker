import {
  readManifest as untypedReadManifest,
  testsCleanUpAutomatically as untypedTestsCleanUpAutomatically,
} from '../eslint-config/scope-support.mts';
import { defaultResolvedLayout } from '../layout.mts';
import { fieldOf, fieldsOf, optionalText } from '../../../../shared/values/readers.mts';
import type {
  DetectionLayout,
  PackageManifest,
  RunnerDetection,
  RunnerEvidence,
} from './typed/command-types.mts';
import { ambiguityMessage, chooseRunner } from './detection/choose-runner.mts';
import { runnerDisplayName } from './runners.mts';
import { configEvidence, dependencyEvidence } from './detection/project-files.mts';
import { importEvidence } from './detection/test-imports.mts';
import {
  TEST_SCRIPT,
  manifestScripts,
  otherTestScriptNames,
  scriptCommand,
  scriptEvidence,
} from './detection/test-scripts.mts';

const readManifest: (projectRoot: string) => unknown = untypedReadManifest;

const testsCleanUpAutomatically: (projectRoot: string, runner?: string) => boolean =
  untypedTestsCleanUpAutomatically;

type RunnerFacts = { detectedRunner?: string; runnerAmbiguity?: string };

function manifestFields(projectRoot: string): PackageManifest {
  return fieldsOf(readManifest(projectRoot) ?? {});
}

export function runnerDetection(
  projectRoot: string,
  layout: DetectionLayout = defaultResolvedLayout,
): RunnerDetection {
  const manifest = manifestFields(projectRoot);
  const scripts = manifestScripts(manifest);
  return chooseRunner([
    () => scriptEvidence(scripts, [TEST_SCRIPT]),
    () => [
      ...scriptEvidence(scripts, otherTestScriptNames(scripts)),
      ...configEvidence(projectRoot, manifest),
    ],
    () => importEvidence(projectRoot, layout),
    () => dependencyEvidence(manifest),
  ]);
}

export function detectTestRunner(projectRoot: string, layout?: DetectionLayout): RunnerEvidence {
  const detection = runnerDetection(projectRoot, layout);
  if (detection.candidates !== undefined) {
    throw new Error(ambiguityMessage(detection.candidates));
  }
  return detection;
}

export function testRunnerFor(
  projectRoot: string,
  configured: string | undefined,
  layout?: DetectionLayout,
): RunnerEvidence {
  return configured === undefined
    ? detectTestRunner(projectRoot, layout)
    : {
        runner: configured,
        evidence: 'nitpicker.config.json "tools.tests.runner"',
        command: scriptCommand(manifestScripts(readManifest(projectRoot)), configured),
      };
}

function detectedRunnerFact(
  projectRoot: string,
  {
    configured,
    layout,
  }: { readonly configured: string | undefined; readonly layout?: DetectionLayout | undefined },
): RunnerFacts {
  const detection = runnerDetection(projectRoot, layout);
  if (detection.candidates === undefined) {
    return { detectedRunner: detection.runner };
  }
  return configured === undefined
    ? {
        detectedRunner: detection.fallback,
        runnerAmbiguity: ambiguityMessage(detection.candidates),
      }
    : {};
}

const TEST_RUNNING_ANALYZERS = new Set(['coverage', 'crap', 'mutation']);

export function runnerChoiceNotices(
  tests: {
    readonly runnerAmbiguity?: string | undefined;
    readonly detectedRunner?: string | undefined;
  },
  analyzers: readonly { readonly name: string }[],
): string[] {
  if (tests.runnerAmbiguity === undefined) {
    return [];
  }
  if (analyzers.some(({ name }) => TEST_RUNNING_ANALYZERS.has(name))) {
    throw new Error(tests.runnerAmbiguity);
  }
  return [
    `Test runner detection ${tests.runnerAmbiguity} Until then the test-file lint rules follow ` +
      `${runnerDisplayName(tests.detectedRunner)}, and coverage, CRAP and mutation testing cannot run.`,
  ];
}

export function withTestRunnerFacts<Policy extends Readonly<Record<string, unknown>>>(
  policy: Policy,
  projectRoot: string,
  layout?: DetectionLayout,
): Policy & { readonly tools: Readonly<Record<string, unknown>> } {
  const tools = fieldOf(policy, 'tools');
  const configured = optionalText(fieldOf(fieldOf(tools, 'tests'), 'runner'));
  const tests = {
    ...fieldsOf(fieldOf(tools, 'tests')),
    ...detectedRunnerFact(projectRoot, { configured, layout }),
  };
  const runner = optionalText(fieldOf(tests, 'runner') ?? fieldOf(tests, 'detectedRunner'));
  const reactPolicy = fieldOf(policy, 'react');
  const react =
    fieldOf(reactPolicy, 'enabled') === true
      ? {
          react: {
            ...fieldsOf(reactPolicy),
            autoCleanup: testsCleanUpAutomatically(projectRoot, runner),
          },
        }
      : {};
  return { ...policy, ...react, tools: { ...fieldsOf(tools), tests } };
}
