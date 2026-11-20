import { existsSync } from 'node:fs';
import path from 'node:path';
import { isRealPathInside, isRegularFile } from '../../../../shared/conventions/read-inside.mjs';
import type TypeScript from 'typescript';
import { lazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';

export const PROJECT_TSCONFIG = 'tsconfig.json';

function typescriptCompiler(): typeof TypeScript {
  return lazyTypeScriptApi();
}

export function typescriptVersion(): string {
  return typescriptCompiler().version;
}

export function readJsonc(file: string): unknown {
  const typescript = typescriptCompiler();
  const result = typescript.readConfigFile(file, (name) => typescript.sys.readFile(name));
  const config: unknown = result.config;
  return config;
}

export function parsedTsconfig(configFile: string): TypeScript.ParsedCommandLine {
  const typescript = typescriptCompiler();
  return typescript.parseJsonConfigFileContent(
    readJsonc(configFile) ?? {},
    { ...typescript.sys, readDirectory: () => [] },
    path.dirname(configFile),
    undefined,
    configFile,
  );
}

export function projectRootFiles(projectDirectory: string, configName: string): string[] {
  const typescript = typescriptCompiler();
  const configFile = path.join(projectDirectory, configName);
  return typescript
    .parseJsonConfigFileContent(
      readJsonc(configFile) ?? {},
      typescript.sys,
      projectDirectory,
      undefined,
      configFile,
    )
    .fileNames.map((file) => `./${path.relative(projectDirectory, file).split(path.sep).join('/')}`)
    .filter((file) => !file.startsWith('./..'));
}

export function configFileNames(configFile: string): string[] {
  const typescript = typescriptCompiler();
  return typescript
    .parseJsonConfigFileContent(
      readJsonc(configFile) ?? {},
      typescript.sys,
      path.dirname(configFile),
      undefined,
      configFile,
    )
    .fileNames.map((file) => path.resolve(file));
}

export function includedFileNames(
  directory: string,
  {
    include,
    exclude,
  }: { readonly include: readonly string[]; readonly exclude: readonly string[] },
): string[] {
  const typescript = typescriptCompiler();
  return typescript
    .parseJsonConfigFileContent({ include, exclude }, typescript.sys, directory)
    .fileNames.map((file) => path.resolve(file));
}

function referencedConfigFile(projectDirectory: string, reference: unknown): string {
  const target = path.resolve(projectDirectory, textOf(fieldOf(reference, 'path')));
  return path.extname(target) === '.json' ? target : path.join(target, PROJECT_TSCONFIG);
}

export function referencedTsconfigs(
  configFile: string,
  config: unknown = readJsonc(configFile),
): string[] {
  return listOf(fieldOf(config, 'references'))
    .map((reference) => referencedConfigFile(path.dirname(configFile), reference))
    .filter((file) => existsSync(file));
}

export function isSolutionTsconfig(config: unknown): boolean {
  return (
    listOf(fieldOf(config, 'references')).length > 0 &&
    fieldOf(config, 'compilerOptions') === undefined &&
    fieldOf(config, 'include') === undefined &&
    listOf(fieldOf(config, 'files')).length === 0
  );
}

const PROJECT_CONFIG = /(?:^|\/)tsconfig\.json$/u;
const DEPENDENCY_FOLDER = /(?:^|\/)node_modules\//u;

function referencedConfigs(projectRoot: string, config: string): string[] {
  return referencedTsconfigs(path.join(projectRoot, config)).map((file) =>
    path.relative(projectRoot, file).split(path.sep).join('/'),
  );
}

export function projectTsconfigs(
  projectRoot: string,
  files: readonly string[],
  hiddenFile?: (file: string) => boolean,
): string[] {
  const isHidden = hiddenFile ?? (() => false);
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

export function checksJavascript(configFile: string): boolean {
  return parsedTsconfig(configFile).options.checkJs === true;
}

const LIB_FILE = /^lib\.(.+)\.d\.ts$/u;

export function projectLibs(projectDirectory: string, configName: string): string[] | undefined {
  const { options } = parsedTsconfig(path.join(projectDirectory, configName));
  return options.lib?.map((lib) => path.basename(lib).replace(LIB_FILE, '$1'));
}

const NO_INPUTS = 18003;

export function tsconfigProblems(configFile: string): string[] {
  const typescript = typescriptCompiler();
  const { error } = typescript.readConfigFile(configFile, (name) => typescript.sys.readFile(name));
  const problems =
    error === undefined
      ? parsedTsconfig(configFile).errors.filter(({ code }) => code !== NO_INPUTS)
      : [error];
  return problems.map((problem) =>
    typescript.flattenDiagnosticMessageText(problem.messageText, '\n'),
  );
}

function extendedFiles(configFile: string): string[] {
  const extended = fieldOf(readJsonc(configFile), 'extends');
  const entries: unknown[] = Array.isArray(extended) ? extended : [extended];
  return entries
    .filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('.'))
    .map((entry) => path.resolve(path.dirname(configFile), entry))
    .map((file) => (isRegularFile(file) || file.endsWith('.json') ? file : `${file}.json`));
}

function isTrackedInside(root: string, file: string): boolean {
  return (
    file.startsWith(`${root}${path.sep}`) && isRegularFile(file) && isRealPathInside(root, file)
  );
}

export function tsconfigChain(projectRoot: string, relativeConfig: string): string[] {
  const root = path.resolve(projectRoot);
  const found = [path.resolve(root, relativeConfig)];
  for (const file of found) {
    appendAll(
      found,
      extendedFiles(file).filter((next) => !found.includes(next) && isTrackedInside(root, next)),
    );
  }
  return found
    .filter((file) => isTrackedInside(root, file))
    .map((file) => path.relative(root, file).split(path.sep).join('/'));
}
