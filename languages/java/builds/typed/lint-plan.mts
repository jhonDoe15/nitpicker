import {
  fieldOf,
  fieldsOf,
  optionalText,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';

export type LintCompiler = {
  readonly release: string | undefined;
  readonly source: string | undefined;
  readonly target: string | undefined;
  readonly encoding?: string | undefined;
  readonly args: string[];
};
export type LintPlan = Readonly<Record<string, unknown>> & {
  readonly root: string;
  readonly basedir: string;
  readonly reportRoot: string;
  readonly sources: readonly string[];
  readonly generatedSources: readonly string[];
  readonly classDirectory: string;
  readonly classpath: readonly string[];
  readonly processorPath: readonly string[];
  readonly javac: string;
  readonly compiler: LintCompiler;
  readonly workDirectory: string;
  readonly cacheDirectory: string;
  readonly spawn?: unknown;
};

function compilerOf(value: unknown): LintCompiler {
  const compiler = fieldsOf(value);
  return {
    ...compiler,
    release: optionalText(compiler['release']),
    source: optionalText(compiler['source']),
    target: optionalText(compiler['target']),
    encoding: optionalText(compiler['encoding']),
    args: textsOf(compiler['args']),
  };
}

export function lintPlanOf(value: unknown): LintPlan {
  return {
    ...fieldsOf(value),
    root: textOf(fieldOf(value, 'root')),
    basedir: textOf(fieldOf(value, 'basedir')),
    reportRoot: textOf(fieldOf(value, 'reportRoot')),
    sources: textsOf(fieldOf(value, 'sources')),
    generatedSources: textsOf(fieldOf(value, 'generatedSources')),
    classDirectory: textOf(fieldOf(value, 'classDirectory')),
    classpath: textsOf(fieldOf(value, 'classpath')),
    processorPath: textsOf(fieldOf(value, 'processorPath')),
    javac: textOf(fieldOf(value, 'javac')),
    compiler: compilerOf(fieldOf(value, 'compiler')),
    workDirectory: textOf(fieldOf(value, 'workDirectory')),
    cacheDirectory: textOf(fieldOf(value, 'cacheDirectory')),
  };
}
