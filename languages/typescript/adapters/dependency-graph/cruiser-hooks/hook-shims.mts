import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mts';

type Shim = {
  readonly module: string;
  readonly original: string;
  readonly imports: string;
  readonly body: string;
};

const MERGE_MANIFESTS = 'merge-manifests';
const DEFAULT_ORIGINAL = 'original';

const SHIMS: ReadonlyMap<string, Shim> = new Map([
  [
    'extract-dependencies',
    {
      module: 'extract-dependencies',
      original: DEFAULT_ORIGINAL,
      imports: 'isolatedExtract',
      body: 'export default isolatedExtract(original);',
    },
  ],
  [
    'typescript-wrap',
    {
      module: 'typescript-wrap',
      original: DEFAULT_ORIGINAL,
      imports: 'withInputFileName',
      body: 'export default (flavor) => withInputFileName(original(flavor), flavor);',
    },
  ],
  [
    'get-manifest',
    {
      module: MERGE_MANIFESTS,
      original: '* as original',
      imports: 'normalizedManifest',
      body: [
        'export const getManifest = (...parameters) =>',
        '  normalizedManifest(original.getManifest(...parameters));',
        'export const clearCache = () => original.clearCache();',
      ].join('\n'),
    },
  ],
  [
    MERGE_MANIFESTS,
    {
      module: MERGE_MANIFESTS,
      original: DEFAULT_ORIGINAL,
      imports: 'normalizedManifest',
      body: 'export default (closest, further) =>\n  original(normalizedManifest(closest), normalizedManifest(further));',
    },
  ],
]);

function replacementModule(name: string): string {
  return checkoutModuleUrl(pathToFileURL(path.join(import.meta.dirname, `${name}.mjs`))).href;
}

export function shimUrl(name: string, originalUrl: string): string | undefined {
  const shim = SHIMS.get(name);
  if (shim === undefined) {
    return undefined;
  }
  const source = [
    `import ${shim.original} from ${JSON.stringify(originalUrl)};`,
    `import { ${shim.imports} } from ${JSON.stringify(replacementModule(shim.module))};`,
    shim.body,
    '',
  ].join('\n');
  return `data:text/javascript,${encodeURIComponent(source)}`;
}
