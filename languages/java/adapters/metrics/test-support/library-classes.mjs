import { partsOf } from '../../../../../shared/rules/stability/test-support/library-project.mjs';

const PART_CLASSES = { face: 'Api', domain: 'domain.Model', adapters: 'adapters.Store' };
const ROOT_CLASSES = { shared: 'library.shared.Ids', main: 'library.App' };

export function libraryClass(reference) {
  const { feature, part } = partsOf(reference);
  return feature === undefined
    ? ROOT_CLASSES[part]
    : `library.features.${feature}.${PART_CLASSES[part]}`;
}

export function libraryJdeps(uses) {
  return uses
    .map(([source, target]) => `   ${libraryClass(source)} -> ${libraryClass(target)} classes`)
    .join('\n');
}

export function libraryClasses(uses, { sourceRoot, extension }) {
  return {
    classes: [...new Set(uses.flat().map(libraryClass))].sort(),
    fileOf: (name) => `${sourceRoot}/${name.replaceAll('.', '/')}.${extension}`,
  };
}
