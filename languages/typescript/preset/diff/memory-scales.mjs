import { codeExtensionNames } from '../layout.mjs';

const MEGABYTES_PER_THOUSAND_FILES = new Map([
  ['eslint-lint', 768],
  ['typescript-typecheck', 640],
  ['structure', 600],
  ['eslint-errors', 512],
  ['eslint-logging', 512],
  ['eslint-module-effects', 512],
  ['entry-points', 420],
  ['dead-code', 380],
  ['prettier-format', 320],
  ['dependency-architecture', 250],
  ['duplicates', 120],
  ['coding-standards', 60],
  ['coupling', 40],
  ['test-runtime', 40],
]);

export function memoryScaleOf(analyzerName) {
  const perThousandFilesMegabytes = MEGABYTES_PER_THOUSAND_FILES.get(analyzerName);
  return perThousandFilesMegabytes === undefined
    ? undefined
    : { perThousandFilesMegabytes, extensions: codeExtensionNames };
}
