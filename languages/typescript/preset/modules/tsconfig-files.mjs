import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TYPESCRIPT_API } from '../../typescript-api/api-selection.mjs';

export const PROJECT_TSCONFIG = 'tsconfig.json';

function typescriptCompiler() {
  return createRequire(import.meta.url)(TYPESCRIPT_API.file);
}

export function typescriptVersion() {
  return typescriptCompiler().version;
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

function referencedConfigFile(projectDirectory, reference) {
  const target = path.resolve(projectDirectory, reference.path);
  return path.extname(target) === '.json' ? target : path.join(target, PROJECT_TSCONFIG);
}

export function referencedTsconfigs(configFile, config = readJsonc(configFile)) {
  return (config?.references ?? [])
    .map((reference) => referencedConfigFile(path.dirname(configFile), reference))
    .filter((file) => existsSync(file));
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
  return referencedTsconfigs(path.join(projectRoot, config)).map((file) =>
    path.relative(projectRoot, file).split(path.sep).join('/'),
  );
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

const LIB_FILE = /^lib\.(.+)\.d\.ts$/u;

export function projectLibs(projectDirectory, configName) {
  const { options } = parsedTsconfig(path.join(projectDirectory, configName));
  return options.lib?.map((lib) => path.basename(lib).replace(LIB_FILE, '$1'));
}

const NO_INPUTS = 18003;

export function tsconfigProblems(configFile) {
  const typescript = typescriptCompiler();
  const { error } = typescript.readConfigFile(configFile, typescript.sys.readFile);
  const problems =
    error === undefined
      ? parsedTsconfig(configFile).errors.filter(({ code }) => code !== NO_INPUTS)
      : [error];
  return problems.map((problem) =>
    typescript.flattenDiagnosticMessageText(problem.messageText, '\n'),
  );
}

function extendedFiles(configFile) {
  const extended = readJsonc(configFile)?.extends;
  return (Array.isArray(extended) ? extended : [extended])
    .filter((entry) => typeof entry === 'string' && entry.startsWith('.'))
    .map((entry) => path.resolve(path.dirname(configFile), entry))
    .map((file) => (existsSync(file) || file.endsWith('.json') ? file : `${file}.json`));
}

export function tsconfigChain(projectRoot, relativeConfig) {
  const root = path.resolve(projectRoot);
  const found = [path.resolve(root, relativeConfig)];
  for (const file of found) {
    found.push(
      ...extendedFiles(file).filter(
        (next) =>
          !found.includes(next) && next.startsWith(`${root}${path.sep}`) && existsSync(next),
      ),
    );
  }
  return found
    .filter((file) => existsSync(file))
    .map((file) => path.relative(root, file).split(path.sep).join('/'));
}
