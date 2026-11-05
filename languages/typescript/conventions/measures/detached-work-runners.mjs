export const DETACHED_WORK_RUNNERS_CONVENTION = {
  id: 'typescript.detachedWorkRunners',
  label: 'Detached-work runners',
  kind: 'names',
  fallback: [],
  files: [],
};

export function detachedWorkRunnerNames(conventions = {}) {
  return conventions[DETACHED_WORK_RUNNERS_CONVENTION.id] ?? [];
}
