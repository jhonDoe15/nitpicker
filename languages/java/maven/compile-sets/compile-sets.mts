import path from 'node:path';
import type { Classpaths } from '../typed/maven-values.mts';
import type { CompilerSettings, SourceModule } from './compiler-types.mts';
import { selectedSources } from './source-patterns.mts';

export type Modular = boolean | 'all';
export type CompileSet = {
  readonly name: string;
  readonly roots: readonly string[];
  readonly sources: readonly string[];
  readonly compiler: CompilerSettings;
  readonly classpath: readonly string[];
  readonly compiled?: readonly string[];
  readonly own: readonly string[];
  readonly test: boolean;
  readonly modular: Modular;
};

const MODULE_INFO = 'module-info.java';

function setName(id: string, index: number): string {
  return `main-${String(index + 1)}-${id.replaceAll(/[^\w.-]/gu, '-')}`;
}

function isDescriptor(file: string): boolean {
  return path.basename(file) === MODULE_INFO;
}

function sized(
  shape: SetShape,
  sources: readonly string[],
): Pick<CompileSet, 'sources' | 'modular'> {
  const kept = sources.every(isDescriptor) ? [] : sources;
  return { sources: kept, modular: kept.some(isDescriptor) ? shape.modular : false };
}

function withoutDescriptor(files: readonly string[], modular: Modular): string[] {
  return files.filter((file) => modular !== false || !isDescriptor(file));
}

export function isModular(files: readonly string[]): boolean {
  return files.some(isDescriptor);
}

type SetShape = Omit<CompileSet, 'name' | 'sources' | 'compiler'>;
type ModuleFiles = { readonly main: readonly string[]; readonly test: readonly string[] };
type SetsRequest = {
  readonly module: SourceModule;
  readonly classpaths: Classpaths;
  readonly files: ModuleFiles;
};

function mainSets(
  { module, files: all }: SetsRequest,
  compiler: CompilerSettings,
  shape: SetShape,
): CompileSet[] {
  const files = withoutDescriptor(all.main, shape.modular);
  const main = selectedSources(module.sourceRoots, files, compiler.sources);
  const taken = new Set(main);
  const extra = (compiler.executions ?? []).map((execution, index): CompileSet => {
    const sources = selectedSources(module.sourceRoots, files, execution.sources).filter(
      (file) => !taken.has(file),
    );
    for (const file of sources) {
      taken.add(file);
    }
    return {
      ...shape,
      ...sized(shape, sources),
      name: setName(execution.id, index),
      compiler: { ...compiler, ...execution },
    };
  });
  return [{ ...shape, ...sized(shape, main), name: 'main', compiler }, ...extra];
}

export function compileSets(
  request: SetsRequest,
  compiler: CompilerSettings,
  modular: Modular,
): CompileSet[] {
  const { module, classpaths, files } = request;
  const testCompiler = { ...compiler, ...compiler.test };
  const testFiles = withoutDescriptor(files.test, false);
  return [
    ...mainSets(request, compiler, {
      roots: module.sourceRoots,
      classpath: [...classpaths.mainCompile, module.outputDirectory],
      own: [module.outputDirectory],
      test: false,
      modular,
    }),
    {
      name: 'test',
      roots: module.testSourceRoots,
      sources: selectedSources(module.testSourceRoots, testFiles, compiler.test?.sources),
      compiler: testCompiler,
      classpath: [module.outputDirectory, ...classpaths.testCompile],
      compiled: [module.testOutputDirectory],
      own: [module.outputDirectory, module.testOutputDirectory],
      test: true,
      modular: false,
    },
  ];
}
