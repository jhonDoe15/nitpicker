import { createRequire } from 'node:module';
import path from 'node:path';

export const PROJECT_TSCONFIG = 'tsconfig.json';

function typescriptCompiler() {
  return createRequire(import.meta.url)('typescript');
}

export function readJsonc(file) {
  const typescript = typescriptCompiler();
  const { config } = typescript.readConfigFile(file, typescript.sys.readFile);
  return config;
}

export function parsedTsconfig(configFile) {
  const typescript = typescriptCompiler();
  return typescript.parseJsonConfigFileContent(
    readJsonc(configFile) ?? {},
    { ...typescript.sys, readDirectory: () => [] },
    path.dirname(configFile),
    undefined,
    configFile,
  );
}

export function referencedConfigFile(projectDirectory, reference) {
  const target = path.resolve(projectDirectory, reference.path);
  return path.extname(target) === '.json' ? target : path.join(target, PROJECT_TSCONFIG);
}

export function isSolutionTsconfig(config) {
  return (
    Array.isArray(config?.references) &&
    config.references.length > 0 &&
    config.compilerOptions === undefined &&
    config.include === undefined &&
    (config.files ?? []).length === 0
  );
}

export function projectChecksJavascript(projectRoot) {
  return parsedTsconfig(path.join(projectRoot, PROJECT_TSCONFIG)).options.checkJs === true;
}
