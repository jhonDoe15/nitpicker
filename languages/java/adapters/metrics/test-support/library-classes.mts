import { partsOf as untypedPartsOf } from '../../../../../shared/rules/stability/test-support/library-project.mjs';
import { byText as untypedByText } from '../../../../../shared/text-order/by-text.mjs';

type LibraryUse = readonly string[];

const partsOf: (reference: string) => { readonly feature?: string; readonly part: string } =
  untypedPartsOf;
const byText: (left: string, right: string) => number = untypedByText;
const PART_CLASSES: Readonly<Record<string, string>> = {
  face: 'Api',
  domain: 'domain.Model',
  adapters: 'adapters.Store',
};
const ROOT_CLASSES: Readonly<Record<string, string>> = {
  shared: 'library.shared.Ids',
  main: 'library.App',
};

export function libraryClass(reference: string): string {
  const { feature, part } = partsOf(reference);
  return feature === undefined
    ? String(ROOT_CLASSES[part])
    : `library.features.${feature}.${String(PART_CLASSES[part])}`;
}

export function libraryJdeps(uses: readonly LibraryUse[]): string {
  return uses
    .map(
      ([source = '', target = '']) =>
        `   ${libraryClass(source)} -> ${libraryClass(target)} classes`,
    )
    .join('\n');
}

export function libraryClasses(
  uses: readonly LibraryUse[],
  { sourceRoot, extension }: { readonly sourceRoot: string; readonly extension: string },
): { readonly classes: string[]; readonly fileOf: (name: string) => string } {
  return {
    classes: [...new Set(uses.flat().map(libraryClass))].sort(byText),
    fileOf: (name: string) => `${sourceRoot}/${name.replaceAll('.', '/')}.${extension}`,
  };
}
