import { listed } from './hidden-code.mjs';

const LISTED_FILES = 3;

export function generatedMarkingChanges(scope) {
  const marked = scope.keptCode
    .filter((file) => scope.generated.head(file) && !scope.generated.base(file))
    .toSorted();
  if (marked.length === 0) {
    return { loosened: [], changed: [] };
  }
  function describe(limit) {
    return `generated-file markers added to checked code, which the checks now skip: ${listed(marked, limit)}`;
  }
  return {
    loosened: [{ text: describe(LISTED_FILES), key: describe(marked.length), files: marked }],
    changed: [],
  };
}
