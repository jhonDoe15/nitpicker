import type { RunnerVocabulary } from '../typed/vocabulary-types.mts';
import {
  projectRunnerVocabulary as untypedProjectRunnerVocabulary,
  runnerVocabulary as untypedRunnerVocabulary,
} from './runner-vocabulary.mts';

export type { RunnerVocabulary } from '../typed/vocabulary-types.mts';

export const runnerVocabulary: (runner?: string) => RunnerVocabulary = untypedRunnerVocabulary;

export const projectRunnerVocabulary: () => RunnerVocabulary = untypedProjectRunnerVocabulary;
