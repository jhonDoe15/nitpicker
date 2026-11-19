import {
  projectRunnerVocabulary as untypedProjectRunnerVocabulary,
  runnerVocabulary as untypedRunnerVocabulary,
} from './runner-vocabulary.mjs';

export type RunnerVocabulary = {
  readonly wholeOutput: string;
  readonly fragmentForms: string;
  readonly wholeValue: string;
  readonly partialForms: string;
  readonly variedField: string;
  readonly helperFile: string;
  readonly fakeClock: string;
  readonly fixRandom: string;
  readonly collectIt: string;
  readonly waitOnCondition: string;
  readonly pollInstead: string;
  readonly advanceFakeTime: string;
  readonly domSetup: string;
  readonly rejection: string;
  readonly assertCall: string;
  readonly assertIt: string;
  readonly testFunctions: string;
  readonly sharedSetupHook: string;
  readonly eachCase: string;
  readonly assertVisible: string;
  readonly assertFocus: string;
  readonly anyInTests: string;
};

export const runnerVocabulary: (runner?: string) => RunnerVocabulary = untypedRunnerVocabulary;

export const projectRunnerVocabulary: () => RunnerVocabulary = untypedProjectRunnerVocabulary;
