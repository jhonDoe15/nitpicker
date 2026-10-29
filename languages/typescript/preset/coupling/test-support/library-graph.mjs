import { partsOf } from '../../../../../shared/rules/stability/test-support/library-project.mjs';

export const LIBRARY_ROOT = 'src/main';

const PART_FILES = { face: 'index', domain: 'domain/model', adapters: 'adapters/store' };
const ROOT_FILES = { shared: 'shared/ids', main: 'composition-root' };

function fileOf(reference) {
  const { feature, part } = partsOf(reference);
  const name = feature === undefined ? ROOT_FILES[part] : `features/${feature}/${PART_FILES[part]}`;
  return `${LIBRARY_ROOT}/${name}.ts`;
}

export function libraryGraph(uses) {
  const files = [...new Set(uses.flat().map(fileOf))].sort();
  return {
    modules: files.map((source) => ({
      source,
      dependencies: uses
        .filter(([from]) => fileOf(from) === source)
        .map(([, to]) => ({ resolved: fileOf(to), dependencyTypes: ['local'] })),
    })),
  };
}
