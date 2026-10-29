import { ts } from '../../typescript-api/typescript-api.mjs';
import path from 'node:path';

function readCompilerConfig(configPath) {
  const file = path.resolve(configPath);
  const read = ts.readConfigFile(file, (name) => ts.sys.readFile(name));
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  }
  const config = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(file),
    { noEmit: true },
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

export function readCompilerConfigs(configPath) {
  const pending = [path.resolve(configPath)];
  const configs = new Map();
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

function mutatedText(source, mutant) {
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

export function compile(config, mutant) {
  const host = ts.createCompilerHost(config.options, true);
  const readSource = host.getSourceFile.bind(host);
  host.useSourceOfProjectReferenceRedirect = () => true;
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
    projectReferences: config.projectReferences,
    host,
  });
  return ts.getPreEmitDiagnostics(program);
}
