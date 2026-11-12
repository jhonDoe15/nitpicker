import { globMatcher } from '../../shared/paths/glob.mjs';
import { pythonImportedFiles } from '../../languages/python/adapters/analysis/reach/python-reach.mjs';
import { resolveLayoutFor } from '../../languages/typescript/preset/layout.mjs';
import { directlyImportedFiles } from '../../languages/typescript/preset/modules/production-imports.mjs';

const LAYOUT_LESS_PRESETS = new Set(['java', 'kotlin', 'go']);

function excludedBy(config) {
  const patterns = (config.exclude ?? []).map(globMatcher);
  return (file) => patterns.some((pattern) => pattern.test(file));
}

function importedSet({ projectRoot, config, files, roots }) {
  if (config.preset === 'python') {
    return pythonImportedFiles(projectRoot, {
      sourceRoots: roots['python.sourceRoots'],
      isHidden: excludedBy(config),
    });
  }
  if (LAYOUT_LESS_PRESETS.has(config.preset)) {
    return new Set();
  }
  const layout = resolveLayoutFor(config);
  return directlyImportedFiles(
    projectRoot,
    files.filter((file) => layout.isSourceFile(file)),
  );
}

export function importedAmong(project, candidates) {
  if (candidates.length === 0) {
    return [];
  }
  const imported = importedSet(project);
  return candidates.filter((file) => imported.has(file));
}
