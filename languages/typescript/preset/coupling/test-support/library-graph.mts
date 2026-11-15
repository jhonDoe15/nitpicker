import { partsOf as untypedPartsOf } from '../../../../../shared/rules/stability/test-support/library-project.mjs';
import { byText } from '../../../../../shared/text-order/by-text.mjs';

import type { CouplingGraph } from './analyze-view.mts';

export const LIBRARY_ROOT = 'src';

const partsOf: (reference: string) => { readonly feature?: string; readonly part: string } =
  untypedPartsOf;

const PART_FILES: Readonly<Record<string, string>> = {
  face: 'index',
  domain: 'domain/model',
  adapters: 'adapters/store',
};
const ROOT_FILES: Readonly<Record<string, string>> = {
  shared: 'shared/ids',
  main: 'composition-root',
};

function fileOf(reference: string | undefined): string {
  const { feature, part } = partsOf(reference ?? '');
  const name =
    feature === undefined ? ROOT_FILES[part] : `features/${feature}/${String(PART_FILES[part])}`;
  return `${LIBRARY_ROOT}/main/${String(name)}.ts`;
}

export function libraryGraph(uses: readonly (readonly string[])[]): CouplingGraph {
  const files = [...new Set(uses.flat().map(fileOf))].sort(byText);
  return {
    modules: files.map((source) => ({
      source,
      dependencies: uses
        .filter(([from]) => fileOf(from) === source)
        .map(([, to]) => ({ resolved: fileOf(to), dependencyTypes: ['local'] })),
    })),
  };
}
