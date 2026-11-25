import { codeExtensionNames } from '../layout.mts';
import { typecheckProgramRoots } from '../modules/program-reach/program-roots.mts';

const TSGO_SERVER_BASE_MEGABYTES = 1600;

type ProgramRoots = (projectRoot: string) => readonly string[];
const PROGRAM_ROOTS = new Map<string, ProgramRoots>([
  ['typescript-typecheck', typecheckProgramRoots],
  ['structure', typecheckProgramRoots],
]);

const BASE_MEGABYTES = new Map<string, number>([
  ['eslint-lint', TSGO_SERVER_BASE_MEGABYTES],
  ['typescript-typecheck', TSGO_SERVER_BASE_MEGABYTES],
  ['structure', TSGO_SERVER_BASE_MEGABYTES],
  ['coding-standards', TSGO_SERVER_BASE_MEGABYTES],
]);

const MEGABYTES_PER_THOUSAND_FILES = new Map<string, number>([
  ['typescript-typecheck', 1280],
  ['eslint-lint', 1024],
  ['structure', 1000],
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

type MemoryScale = {
  baseMegabytes?: number;
  perThousandFilesMegabytes: number;
  extensions: readonly string[];
  roots?: ProgramRoots;
};

function withProgramRoots<Scale>(analyzerName: string, scale: Scale): Scale {
  const roots = PROGRAM_ROOTS.get(analyzerName);
  return scale === undefined || scale === null || roots === undefined ? scale : { ...scale, roots };
}

export function withSizeScales<
  Analyzer extends { readonly name: string; timeoutScale?: unknown; memoryScale?: MemoryScale },
>(analyzer: Analyzer): Analyzer {
  const timeoutScale = withProgramRoots(analyzer.name, analyzer.timeoutScale);
  const memoryScale = memoryScaleOf(analyzer.name);
  return {
    ...analyzer,
    ...(timeoutScale === undefined ? {} : { timeoutScale }),
    ...(memoryScale === undefined ? {} : { memoryScale }),
  };
}

export function memoryScaleOf(analyzerName: string): MemoryScale | undefined {
  const perThousandFilesMegabytes = MEGABYTES_PER_THOUSAND_FILES.get(analyzerName);
  if (perThousandFilesMegabytes === undefined) {
    return undefined;
  }
  const baseMegabytes = BASE_MEGABYTES.get(analyzerName);
  return withProgramRoots(analyzerName, {
    ...(baseMegabytes === undefined ? {} : { baseMegabytes }),
    perThousandFilesMegabytes,
    extensions: codeExtensionNames,
  });
}
