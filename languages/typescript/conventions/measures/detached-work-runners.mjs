export const DETACHED_WORK_RUNNERS_CONVENTION = {
  id: 'typescript.detachedWorkRunners',
  label: 'Detached-work runners',
  kind: 'names',
  namesMeaning: 'the names of the functions that run detached work and handle its rejection',
  fallback: [],
  files: [],
};

export function detachedWorkRunnerNames(conventions = {}) {
  return conventions[DETACHED_WORK_RUNNERS_CONVENTION.id] ?? [];
}
