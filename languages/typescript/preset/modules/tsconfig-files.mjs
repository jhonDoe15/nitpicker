import { existsSync } from 'node:fs';
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

const PROJECT_CONFIG = /(?:^|\/)tsconfig\.json$/u;
const DEPENDENCY_FOLDER = /(?:^|\/)node_modules\//u;

function referencedConfigs(projectRoot, config) {
  const directory = path.join(projectRoot, path.posix.dirname(config));
  return (readJsonc(path.join(projectRoot, config))?.references ?? [])
    .map((reference) => referencedConfigFile(directory, reference))
    .filter((file) => existsSync(file))
    .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
}

export function projectTsconfigs(projectRoot, files, isHidden = () => false) {
  const found = new Set(
    files.filter(
      (file) => PROJECT_CONFIG.test(file) && !DEPENDENCY_FOLDER.test(file) && !isHidden(file),
    ),
  );
  for (const config of found) {
    for (const referenced of referencedConfigs(projectRoot, config)) {
      found.add(referenced);
    }
  }
  return [...found].toSorted();
}

export function checksJavascript(configFile) {
  return parsedTsconfig(configFile).options.checkJs === true;
}
