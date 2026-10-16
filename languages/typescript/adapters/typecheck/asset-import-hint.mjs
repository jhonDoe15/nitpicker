import { stylesheetExtensionNames } from '../../preset/layout.mjs';

const MISSING_MODULE_CODES = new Set([2307, 2792, 2882]);
const ASSET_EXTENSIONS = [
  ...stylesheetExtensionNames,
  'svg',
  'png',
  'jpe?g',
  'gif',
  'webp',
  'avif',
  'ico',
  'woff2?',
  'ttf',
  'otf',
  'mp4',
  'webm',
];
const ASSET_SPECIFIER = new RegExp(`'[^']*\\.(?:${ASSET_EXTENSIONS.join('|')})(?:\\?[^']*)?'`, 'u');

const ASSET_IMPORT_HINT =
  ' For CSS Modules and asset imports, add `vite/client` to `types` in tsconfig.json (or `/// <reference types="vite/client" />` in a `.d.ts` under src/), or declare the module in a `.d.ts` under src/ (`declare module "*.module.css"`).';

export function withAssetImportHint(code, message) {
  return MISSING_MODULE_CODES.has(code) && ASSET_SPECIFIER.test(message)
    ? `${message}${ASSET_IMPORT_HINT}`
    : message;
}
