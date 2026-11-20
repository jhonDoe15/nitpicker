import { codeExtensionNames } from '../layout.mts';
import { typecheckProgramRoots } from '../modules/program-reach/program-roots.mts';

type ProgramRoots = (projectRoot: string) => readonly string[];
const PROGRAM_ROOTS = new Map<string, ProgramRoots>([
  ['typescript-typecheck', typecheckProgramRoots],
]);

const MEGABYTES_PER_THOUSAND_FILES = new Map<string, number>([
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

type MemoryScale = {
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
  if (timeoutScale !== undefined) {
    analyzer.timeoutScale = timeoutScale;
  }
  const memoryScale = memoryScaleOf(analyzer.name);
  if (memoryScale !== undefined) {
    analyzer.memoryScale = memoryScale;
  }
  return analyzer;
}

export function memoryScaleOf(analyzerName: string): MemoryScale | undefined {
  const perThousandFilesMegabytes = MEGABYTES_PER_THOUSAND_FILES.get(analyzerName);
  return perThousandFilesMegabytes === undefined
    ? undefined
    : withProgramRoots(analyzerName, { perThousandFilesMegabytes, extensions: codeExtensionNames });
}
