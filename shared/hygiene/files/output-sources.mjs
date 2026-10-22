import path from 'node:path';

const SOURCE_EXTENSIONS = new Set([
  'js',
  'mjs',
  'cjs',
  'ts',
  'mts',
  'cts',
  'tsx',
  'jsx',
  'java',
  'kt',
  'kts',
  'groovy',
  'gradle',
  'scala',
  'py',
  'pyi',
  'rb',
  'go',
  'rs',
  'sh',
  'bash',
  'ps1',
  'bat',
  'cmd',
  'json',
  'yml',
  'yaml',
  'toml',
  'properties',
  'md',
  'txt',
  'rst',
  'plist',
  'ico',
  'icns',
  'png',
  'svg',
]);
const COMPILED_NAME = /\.d\.[cm]?ts$|\.min\.(?:js|css)$|[.-][0-9a-f]{8,}\.(?:js|css)$/iu;

export function holdsSources(files) {
  return files.every((file) => {
    const base = path.posix.basename(file);
    const extension = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
    return SOURCE_EXTENSIONS.has(extension) && !COMPILED_NAME.test(base);
  });
}
