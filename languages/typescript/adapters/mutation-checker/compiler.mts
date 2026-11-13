import type TypeScript from 'typescript';
import path from 'node:path';
import { typescriptApi } from '../typed/typescript-program.mts';

type Position = { readonly line: number; readonly column: number };

export type Mutant = {
  readonly id: string;
  readonly fileName: string;
  readonly replacement: string;
  readonly location: { readonly start: Position; readonly end: Position };
};

const ts = typescriptApi();

function readCompilerConfig(configPath: string): TypeScript.ParsedCommandLine {
  const file = path.resolve(configPath);
  const read = ts.readConfigFile(file, (name) => ts.sys.readFile(name));
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  }
  const config = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(file),
    { noCheck: false, noEmit: true },
    file,
  );
  if (config.errors.length > 0) {
    throw new Error(
      config.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n'),
    );
  }
  return config;
}

export function readCompilerConfigs(configPath: string): TypeScript.ParsedCommandLine[] {
  const pending = [path.resolve(configPath)];
  const configs = new Map<string, TypeScript.ParsedCommandLine>();
  for (const file of pending) {
    if (configs.has(file)) {
      continue;
    }
    const config = readCompilerConfig(file);
    configs.set(file, config);
    pending.push(...(config.projectReferences ?? []).map(ts.resolveProjectReferencePath));
  }
  return [...configs.values()];
}

function mutatedText(source: TypeScript.SourceFile, mutant: Mutant): string {
  const start = source.getPositionOfLineAndCharacter(
    mutant.location.start.line,
    mutant.location.start.column,
  );
  const end = source.getPositionOfLineAndCharacter(
    mutant.location.end.line,
    mutant.location.end.column,
  );
  return source.text.slice(0, start) + mutant.replacement + source.text.slice(end);
}

export function compile(
  config: TypeScript.ParsedCommandLine,
  mutant?: Mutant,
): readonly TypeScript.Diagnostic[] {
  const host = ts.createCompilerHost(config.options, true);
  const readSource = host.getSourceFile.bind(host);
  Object.assign(host, { useSourceOfProjectReferenceRedirect: () => true });
  host.getSourceFile = (...sourceArguments) => {
    const [file, languageVersion] = sourceArguments;
    const source = readSource(...sourceArguments);
    return source === undefined ||
      mutant === undefined ||
      path.resolve(file) !== path.resolve(mutant.fileName)
      ? source
      : ts.createSourceFile(file, mutatedText(source, mutant), languageVersion, true);
  };
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
    ...(config.projectReferences === undefined
      ? {}
      : { projectReferences: config.projectReferences }),
    host,
  });
  return ts.getPreEmitDiagnostics(program);
}
