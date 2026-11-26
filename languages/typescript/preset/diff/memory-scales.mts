import { codeExtensionNames } from '../layout.mts';
import { typecheckProgramRoots } from '../modules/program-reach/program-roots.mts';
import { holdsProgram, programReachRoots } from '../modules/program-reach/workspace-reach.mts';

type ProgramRoots = (projectRoot: string) => readonly string[];
const PROGRAM_ROOTS = new Map<string, ProgramRoots>([
  ['typescript-typecheck', typecheckProgramRoots],
]);

type Sizing = {
  readonly perThousandFiles: number;
  readonly base: number;
  readonly program?: number;
};

const NODE_PROCESS_MEGABYTES = 300;
const TYPED_TOOLS_MEGABYTES = 400;

const SIZINGS = new Map<string, Sizing>([
  ['eslint-lint', { perThousandFiles: 600, base: TYPED_TOOLS_MEGABYTES, program: 1750 }],
  ['typescript-typecheck', { perThousandFiles: 1000, base: NODE_PROCESS_MEGABYTES, program: 1850 }],
  ['structure', { perThousandFiles: 700, base: NODE_PROCESS_MEGABYTES, program: 2850 }],
  ['coding-standards', { perThousandFiles: 300, base: TYPED_TOOLS_MEGABYTES, program: 0 }],
  ['eslint-errors', { perThousandFiles: 512, base: TYPED_TOOLS_MEGABYTES }],
  ['eslint-logging', { perThousandFiles: 512, base: TYPED_TOOLS_MEGABYTES }],
  ['eslint-module-effects', { perThousandFiles: 512, base: TYPED_TOOLS_MEGABYTES }],
  ['entry-points', { perThousandFiles: 420, base: NODE_PROCESS_MEGABYTES }],
  ['dead-code', { perThousandFiles: 380, base: TYPED_TOOLS_MEGABYTES }],
  ['prettier-format', { perThousandFiles: 320, base: NODE_PROCESS_MEGABYTES }],
  ['dependency-architecture', { perThousandFiles: 250, base: NODE_PROCESS_MEGABYTES }],
  ['duplicates', { perThousandFiles: 120, base: NODE_PROCESS_MEGABYTES }],
  ['coupling', { perThousandFiles: 40, base: NODE_PROCESS_MEGABYTES }],
  ['test-runtime', { perThousandFiles: 40, base: NODE_PROCESS_MEGABYTES }],
]);

type MemoryScale = {
  perThousandFilesMegabytes: number;
  baseMegabytes?: number;
  extensions: readonly string[];
  roots?: ProgramRoots;
  programMegabytes?: number;
  holdsProgram?: (projectRoot: string) => boolean;
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

function programScale(program: number | undefined): Partial<MemoryScale> {
  return program === undefined
    ? {}
    : { roots: programReachRoots, programMegabytes: program, holdsProgram };
}

export function memoryScaleOf(analyzerName: string): MemoryScale | undefined {
  const sizing = SIZINGS.get(analyzerName);
  return sizing === undefined
    ? undefined
    : {
        perThousandFilesMegabytes: sizing.perThousandFiles,
        baseMegabytes: sizing.base,
        extensions: codeExtensionNames,
        ...programScale(sizing.program),
      };
}
