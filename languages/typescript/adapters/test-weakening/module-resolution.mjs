import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const PROJECT_CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json'];

function isFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function parsedConfig(configPath) {
  const { config } = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  return ts.parseJsonConfigFileContent(
    config ?? {},
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
}

function withResolutionDefaults(options) {
  return {
    allowJs: true,
    ...options,
    moduleResolution: options.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
  };
}

export function projectCompilerOptions(root) {
  const configPath = PROJECT_CONFIG_NAMES.map((name) => path.join(root, name)).find(isFile);
  if (configPath === undefined) return [withResolutionDefaults({})];
  const parsed = parsedConfig(configPath);
  const referenced = (parsed.projectReferences ?? [])
    .map((reference) => ts.resolveProjectReferencePath(reference))
    .filter(isFile)
    .map((referencePath) => parsedConfig(referencePath).options);
  return [parsed.options, ...referenced].map(withResolutionDefaults);
}

function projectRelative(realRoot, resolved) {
  if (resolved === undefined || resolved.isExternalLibraryImport === true) return undefined;
  const relative = path.relative(realRoot, realpathSync(resolved.resolvedFileName));
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? undefined
    : relative.replaceAll('\\', '/');
}

export function resolveProjectModule({ root, compilerOptions, fromFile }, specifier) {
  const realRoot = realpathSync(root);
  const containingFile = path.join(root, fromFile);
  return compilerOptions
    .map((options) =>
      projectRelative(
        realRoot,
        ts.resolveModuleName(specifier, containingFile, options, ts.sys).resolvedModule,
      ),
    )
    .find((modulePath) => modulePath !== undefined);
}
