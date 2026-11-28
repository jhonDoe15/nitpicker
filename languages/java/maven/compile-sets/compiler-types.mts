import { fieldOf, objectOf, optionalText, textsOf } from '../../../../shared/values/readers.mts';

export type SourceModule = {
  readonly basedir: string;
  readonly outputDirectory: string;
  readonly testOutputDirectory: string;
  readonly sourceRoots: readonly string[];
  readonly testSourceRoots: readonly string[];
  readonly compiler: unknown;
};
export type CompilerLevel = {
  readonly release: string | undefined;
  readonly source: string | undefined;
  readonly target: string | undefined;
};
export type SourcePatterns = { readonly includes: string[]; readonly excludes: string[] };
type TestCompiler = CompilerLevel & {
  readonly compilerArgs: string[];
  readonly sources?: SourcePatterns | undefined;
  readonly generatedSources?: string | undefined;
};
export type ExtraCompile = TestCompiler & { readonly id: string };
export type CompilerSettings = TestCompiler & {
  readonly encoding: string | undefined;
  readonly proc: string | undefined;
  readonly processorPaths: string[] | undefined;
  readonly processorRepositories?: string[] | undefined;
  readonly test: TestCompiler | undefined;
  readonly executions?: ExtraCompile[] | undefined;
};

function patternsOf(value: unknown): SourcePatterns | undefined {
  return objectOf(value) === undefined
    ? undefined
    : {
        includes: textsOf(fieldOf(value, 'includes')),
        excludes: textsOf(fieldOf(value, 'excludes')),
      };
}

function testCompilerOf(value: unknown): TestCompiler {
  return {
    release: optionalText(fieldOf(value, 'release')),
    source: optionalText(fieldOf(value, 'source')),
    target: optionalText(fieldOf(value, 'target')),
    compilerArgs: textsOf(fieldOf(value, 'compilerArgs')),
    sources: patternsOf(fieldOf(value, 'sources')),
    generatedSources: optionalText(fieldOf(value, 'generatedSources')),
  };
}

function executionsOf(value: unknown): ExtraCompile[] {
  return Array.isArray(value)
    ? value.map((execution) => ({
        ...testCompilerOf(execution),
        id: optionalText(fieldOf(execution, 'id')) ?? 'default',
      }))
    : [];
}

export function compilerOf(value: unknown): CompilerSettings {
  const paths = fieldOf(value, 'processorPaths');
  const test = fieldOf(value, 'test');
  return {
    ...testCompilerOf(value),
    encoding: optionalText(fieldOf(value, 'encoding')),
    proc: optionalText(fieldOf(value, 'proc')),
    processorPaths: Array.isArray(paths) ? textsOf(paths) : undefined,
    processorRepositories: textsOf(fieldOf(value, 'processorRepositories')),
    test: objectOf(test) === undefined ? undefined : testCompilerOf(test),
    executions: executionsOf(fieldOf(value, 'executions')),
  };
}
