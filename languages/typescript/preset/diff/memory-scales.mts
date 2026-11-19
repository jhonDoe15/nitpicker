import { codeExtensionNames } from '../layout.mts';

const MEGABYTES_PER_THOUSAND_FILES = new Map<string, number>([
  ['eslint-lint', 768],
  ['typescript-typecheck', 640],
  ['structure', 600],
  ['eslint-errors', 512],
  ['eslint-logging', 512],
  ['eslint-module-effects', 512],
  ['coding-standards', 480],
  ['dependency-architecture', 420],
  ['entry-points', 420],
  ['coupling', 420],
  ['test-runtime', 420],
  ['dead-code', 380],
  ['prettier-format', 320],
  ['duplicates', 120],
]);

type MemoryScale = { perThousandFilesMegabytes: number; extensions: readonly string[] };

export function memoryScaleOf(analyzerName: string): MemoryScale | undefined {
  const perThousandFilesMegabytes = MEGABYTES_PER_THOUSAND_FILES.get(analyzerName);
  return perThousandFilesMegabytes === undefined
    ? undefined
    : { perThousandFilesMegabytes, extensions: codeExtensionNames };
}
