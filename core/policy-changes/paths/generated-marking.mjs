import { GRADLE_PRESETS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { isGeneratedJvm } from '../../../languages/java/adapters/generated/generated-sources.mjs';
import { isGeneratedPython } from '../../../languages/python/libraries/generated-files.mjs';
import { isMarkedGenerated } from '../../../languages/typescript/preset/layout/generated-files.mjs';

const LISTED_FILES = 3;

function generatedTestOf(preset) {
  if (preset === 'python') {
    return isGeneratedPython;
  }
  return GRADLE_PRESETS.includes(preset) ? isGeneratedJvm : isMarkedGenerated;
}

export function generatedReaders(preset, baseProjectRoot, headProjectRoot) {
  const isGenerated = generatedTestOf(preset);
  return {
    base: (file) => isGenerated(baseProjectRoot, file),
    head: (file) => isGenerated(headProjectRoot, file),
  };
}

function listed(files, limit) {
  const more = files.length > limit ? `, and ${files.length - limit} more` : '';
  return `${files.slice(0, limit).join(', ')}${more}`;
}

export function generatedMarkingChanges(scope) {
  const marked = scope.keptCode
    .filter((file) => scope.generated.head(file) && !scope.generated.base(file))
    .toSorted();
  if (marked.length === 0) {
    return { loosened: [], changed: [] };
  }
  const describe = (limit) =>
    `generated-file markers added to checked code, which the checks now skip: ${listed(marked, limit)}`;
  return {
    loosened: [{ text: describe(LISTED_FILES), key: describe(marked.length), files: marked }],
    changed: [],
  };
}
