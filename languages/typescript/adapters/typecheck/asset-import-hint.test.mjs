import { describe, expect, it } from 'vitest';
import { staticChecks } from '../../preset/quality-checks.mjs';
import { withAssetImportHint } from './asset-import-hint.mjs';

const hint =
  ' For CSS Modules and asset imports, add `vite/client` to `types` in tsconfig.json (or `/// <reference types="vite/client" />` in a `.d.ts` under src/), or declare the module in a `.d.ts` under src/ (`declare module "*.module.css"`).';

function missing(specifier) {
  return `Cannot find module '${specifier}' or its corresponding type declarations.`;
}

describe('hint for CSS Module and asset imports that TypeScript cannot find', () => {
  it.each([
    ['a CSS Module', 2307, missing('./panel.module.css')],
    ['a stylesheet', 2307, missing('./panel.scss')],
    ['an image', 2307, missing('./logo.svg')],
    ['an image with a query', 2307, missing('./logo.png?url')],
    ['a font', 2307, missing('./font.woff2')],
    ['a side-effect stylesheet import', 2882, missing('./plain.css')],
    ['a module-resolution failure', 2792, missing('./panel.module.css')],
  ])('names vite/client and a .d.ts for %s', (_name, code, message) => {
    expect(withAssetImportHint(code, message)).toBe(`${message}${hint}`);
  });

  it.each([
    ['a code module', 2307, missing('./panel.js')],
    ['a package', 2307, missing('left-pad')],
    ['another diagnostic about a stylesheet', 2322, missing('./panel.css')],
    ['a name that only ends like an extension', 2307, missing('./csscss')],
    ['a path where css is not the extension', 2307, missing('./css/panel')],
  ])('leaves %s alone', (_name, code, message) => {
    expect(withAssetImportHint(code, message)).toBe(message);
  });

  it('reports the .d.ts files it sends declarations to as checked', () => {
    const typecheck = staticChecks.find(({ name }) => name === 'typescript-typecheck');

    expect(typecheck.exclusions.filter((glob) => glob.endsWith('.d.ts'))).toEqual([]);
  });
});
