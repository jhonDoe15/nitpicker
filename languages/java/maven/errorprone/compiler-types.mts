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
export type CompilerPass = CompilerLevel & {
  readonly compilerArgs: string[];
  readonly includes?: string[] | undefined;
  readonly excludes?: string[] | undefined;
};
export type CompilerExecution = CompilerPass & {
  readonly id: string;
  readonly test: boolean;
};
export type CompilerSettings = CompilerPass & {
  readonly encoding: string | undefined;
  readonly proc: string | undefined;
  readonly processorPaths: string[] | undefined;
  readonly test: CompilerPass | undefined;
  readonly executions?: CompilerExecution[] | undefined;
};
export type CompilePassSettings = CompilerPass &
  Pick<CompilerSettings, 'encoding' | 'proc' | 'processorPaths'>;

export function passSettings(compiler: CompilerSettings, pass: CompilerPass): CompilePassSettings {
  const { encoding, proc, processorPaths } = compiler;
  return { ...pass, encoding, proc, processorPaths };
}

function compilerPassOf(value: unknown): CompilerPass {
  const includes = textsOf(fieldOf(value, 'includes'));
  const excludes = textsOf(fieldOf(value, 'excludes'));
  return {
    release: optionalText(fieldOf(value, 'release')),
    source: optionalText(fieldOf(value, 'source')),
    target: optionalText(fieldOf(value, 'target')),
    compilerArgs: textsOf(fieldOf(value, 'compilerArgs')),
    ...(includes.length === 0 ? {} : { includes }),
    ...(excludes.length === 0 ? {} : { excludes }),
  };
}

function compilerExecutionOf(value: unknown): CompilerExecution | undefined {
  if (objectOf(value) === undefined) {
    return undefined;
  }
  return {
    ...compilerPassOf(value),
    id: optionalText(fieldOf(value, 'id')) ?? '',
    test: fieldOf(value, 'test') === true,
  };
}

function compilerExecutionsOf(value: unknown): CompilerExecution[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => compilerExecutionOf(entry))
    .filter((entry): entry is CompilerExecution => entry !== undefined);
}

export function compilerOf(value: unknown): CompilerSettings {
  const paths = fieldOf(value, 'processorPaths');
  const test = fieldOf(value, 'test');
  const executions = compilerExecutionsOf(fieldOf(value, 'executions'));
  return {
    ...compilerPassOf(value),
    encoding: optionalText(fieldOf(value, 'encoding')),
    proc: optionalText(fieldOf(value, 'proc')),
    processorPaths: Array.isArray(paths) ? textsOf(paths) : undefined,
    test: objectOf(test) === undefined ? undefined : compilerPassOf(test),
    ...(executions.length === 0 ? {} : { executions }),
  };
}
