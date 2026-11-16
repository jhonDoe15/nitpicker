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
export type TestCompiler = CompilerLevel & { readonly compilerArgs: string[] };
export type CompilerSettings = TestCompiler & {
  readonly encoding: string | undefined;
  readonly proc: string | undefined;
  readonly processorPaths: string[] | undefined;
  readonly test: TestCompiler | undefined;
};

function testCompilerOf(value: unknown): TestCompiler {
  return {
    release: optionalText(fieldOf(value, 'release')),
    source: optionalText(fieldOf(value, 'source')),
    target: optionalText(fieldOf(value, 'target')),
    compilerArgs: textsOf(fieldOf(value, 'compilerArgs')),
  };
}

export function compilerOf(value: unknown): CompilerSettings {
  const paths = fieldOf(value, 'processorPaths');
  const test = fieldOf(value, 'test');
  return {
    ...testCompilerOf(value),
    encoding: optionalText(fieldOf(value, 'encoding')),
    proc: optionalText(fieldOf(value, 'proc')),
    processorPaths: Array.isArray(paths) ? textsOf(paths) : undefined,
    test: objectOf(test) === undefined ? undefined : testCompilerOf(test),
  };
}
