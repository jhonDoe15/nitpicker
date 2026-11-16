import {
  directlyImportedFiles,
  globMatcher,
  pythonImportedFiles,
  resolveLayoutFor,
} from './types/typed-views.mts';
import type { ImportedProject, PolicyConfig } from './types/policy-types.mts';

const LAYOUT_LESS_PRESETS = new Set(['java', 'kotlin', 'go']);
const PYTHON_TEST_FILE = /(?:^|\/)(?:test_[^/]*|[^/]*_test|conftest)\.py$/u;

function pythonNonImporter(config: PolicyConfig): (file: string) => boolean {
  const patterns = (config.exclude ?? []).map(globMatcher);
  return (file) => PYTHON_TEST_FILE.test(file) || patterns.some((pattern) => pattern.test(file));
}

function importedSet({ projectRoot, config, files, roots }: ImportedProject): ReadonlySet<string> {
  if (config.preset === 'python') {
    return pythonImportedFiles(projectRoot, {
      sourceRoots: roots['python.sourceRoots'] ?? [],
      isHidden: pythonNonImporter(config),
    });
  }
  if (config.preset !== undefined && LAYOUT_LESS_PRESETS.has(config.preset)) {
    return new Set<string>();
  }
  const layout = resolveLayoutFor(config);
  return directlyImportedFiles(
    projectRoot,
    files.filter((file) => layout.isSourceFile(file)),
  );
}

export function importedAmong(
  project: ImportedProject,
  candidates: readonly string[],
): readonly string[] {
  if (candidates.length === 0) {
    return [];
  }
  const imported = importedSet(project);
  return candidates.filter((file) => imported.has(file));
}
