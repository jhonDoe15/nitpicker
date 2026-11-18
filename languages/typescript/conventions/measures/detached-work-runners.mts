import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';

export const DETACHED_WORK_RUNNERS_CONVENTION = {
  id: 'typescript.detachedWorkRunners',
  label: 'Detached-work runners',
  kind: 'names',
  namesMeaning: 'the names of the functions that run detached work and handle its rejection',
  fallback: [],
  files: [],
};

export function detachedWorkRunnerNames(conventions: object = {}): string[] {
  return textsOf(fieldOf(conventions, DETACHED_WORK_RUNNERS_CONVENTION.id));
}
