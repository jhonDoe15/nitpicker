import { existsSync } from 'node:fs';
import path from 'node:path';
import { isInsideDirectory } from '../../../../shared/paths/contained-path.mts';
import { codeExtensionNames } from '../layout.mts';
import { isProjectRoot } from '../layout/source-root/root-paths.mts';
import { typecheckProgramRoots } from '../modules/program-reach/program-roots.mts';
import type { ResolvedLayout } from '../typed/layout-types.mts';

type ProgramRoots = (projectRoot: string) => readonly string[];
type LayoutRoots = Pick<ResolvedLayout, 'sourceRoots' | 'testRoots'>;

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

function outermost(directories: readonly string[]): string[] {
  const sorted = [...new Set(directories)].toSorted((left, right) => left.length - right.length);
  const kept: string[] = [];
  for (const directory of sorted) {
    if (!kept.some((parent) => isInsideDirectory(parent, directory))) {
      kept.push(directory);
    }
  }
  return kept;
}

function layoutCountedRoots(layout: LayoutRoots): ProgramRoots {
  const configured = [...layout.sourceRoots, ...layout.testRoots];
  return (projectRoot: string) => {
    const root = path.resolve(projectRoot);
    if (configured.some((entry) => isProjectRoot(entry))) {
      return [root];
    }
    const existing = configured
      .map((entry) => path.resolve(root, entry))
      .filter((candidate) => existsSync(candidate));
    return existing.length === 0 ? [root] : outermost(existing);
  };
}

function countedRootsFor(
  analyzerName: string,
  layout: LayoutRoots | undefined,
): ProgramRoots | undefined {
  const program = PROGRAM_ROOTS.get(analyzerName);
  const configured = layout === undefined ? undefined : layoutCountedRoots(layout);
  if (program === undefined) {
    return configured;
  }
  if (configured === undefined) {
    return program;
  }
  return (projectRoot: string) => outermost([...program(projectRoot), ...configured(projectRoot)]);
}

function withCountedRoots<Scale>(
  analyzerName: string,
  scale: Scale,
  layout: LayoutRoots | undefined,
): Scale {
  const roots = countedRootsFor(analyzerName, layout);
  return scale === undefined || scale === null || roots === undefined ? scale : { ...scale, roots };
}

export function withSizeScales<
  Analyzer extends { readonly name: string; timeoutScale?: unknown; memoryScale?: MemoryScale },
>(analyzer: Analyzer, layout?: LayoutRoots): Analyzer {
  const timeoutScale = withCountedRoots(analyzer.name, analyzer.timeoutScale, layout);
  const memoryScale = memoryScaleOf(analyzer.name, layout);
  return {
    ...analyzer,
    ...(timeoutScale === undefined ? {} : { timeoutScale }),
    ...(memoryScale === undefined ? {} : { memoryScale }),
  };
}

export function memoryScaleOf(analyzerName: string, layout?: LayoutRoots): MemoryScale | undefined {
  const perThousandFilesMegabytes = MEGABYTES_PER_THOUSAND_FILES.get(analyzerName);
  return perThousandFilesMegabytes === undefined
    ? undefined
    : withCountedRoots(
        analyzerName,
        { perThousandFilesMegabytes, extensions: codeExtensionNames },
        layout,
      );
}
