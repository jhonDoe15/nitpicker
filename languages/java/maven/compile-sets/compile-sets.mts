import path from 'node:path';
import { javaFiles } from '../lint/java-files.mts';
import type { Classpaths } from '../typed/maven-values.mts';
import type { CompilerSettings, SourceModule } from '../errorprone/compiler-types.mts';
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

function setName(id: string): string {
  return `main-${id.replaceAll(/[^\w.-]/gu, '-')}`;
}

function withoutDescriptor(files: readonly string[], modular: Modular): string[] {
  return files.filter((file) => modular !== false || path.basename(file) !== MODULE_INFO);
}

export function isModular(module: SourceModule): boolean {
  return javaFiles(module.sourceRoots).some((file) => path.basename(file) === MODULE_INFO);
}

type SetShape = Omit<CompileSet, 'name' | 'sources' | 'compiler'>;

function mainSets(module: SourceModule, compiler: CompilerSettings, shape: SetShape): CompileSet[] {
  const files = withoutDescriptor(javaFiles(module.sourceRoots), shape.modular);
  const main = selectedSources(module.sourceRoots, files, compiler.sources);
  const taken = new Set(main);
  const extra = (compiler.executions ?? []).map((execution): CompileSet => {
    const sources = selectedSources(module.sourceRoots, files, execution.sources).filter(
      (file) => !taken.has(file),
    );
    sources.forEach((file) => taken.add(file));
    return {
      ...shape,
      name: setName(execution.id),
      sources,
      compiler: { ...compiler, ...execution },
    };
  });
  return [{ ...shape, name: 'main', sources: main, compiler }, ...extra];
}

export function compileSets(
  { module, classpaths }: { readonly module: SourceModule; readonly classpaths: Classpaths },
  compiler: CompilerSettings,
  modular: Modular,
): CompileSet[] {
  const testCompiler = { ...compiler, ...compiler.test };
  const testFiles = withoutDescriptor(javaFiles(module.testSourceRoots), false);
  return [
    ...mainSets(module, compiler, {
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
