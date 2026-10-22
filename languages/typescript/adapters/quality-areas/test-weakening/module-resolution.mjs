import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathInside } from '../../../../../shared/filesystem.mjs';

const PROJECT_CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json'];
const MAX_RE_EXPORT_DEPTH = 3;

export function isFile(filePath) {
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
  if (configPath === undefined) {
    return [withResolutionDefaults({})];
  }
  const parsed = parsedConfig(configPath);
  const referenced = (parsed.projectReferences ?? [])
    .map((reference) => ts.resolveProjectReferencePath(reference))
    .filter(isFile)
    .map((referencePath) => parsedConfig(referencePath).options);
  return [parsed.options, ...referenced].map(withResolutionDefaults);
}

function projectRelative(realRoot, resolved) {
  if (resolved === undefined || resolved.isExternalLibraryImport === true) {
    return undefined;
  }
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

function reExportSpecifiers(root, modulePath) {
  const full = pathInside(root, modulePath);
  if (full === undefined) {
    return [];
  }
  const text = readFileSync(full, 'utf8');
  return ts
    .createSourceFile(modulePath, text, ts.ScriptTarget.Latest)
    .statements.filter(
      (statement) =>
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier),
    )
    .map((statement) => statement.moduleSpecifier.text);
}

export function withReExportedModules({ root, compilerOptions }, modulePaths, isSourceFile) {
  const found = new Set(modulePaths);
  const pending = modulePaths.map((modulePath) => ({ modulePath, depth: 0 }));
  for (const { modulePath, depth } of pending) {
    if (depth >= MAX_RE_EXPORT_DEPTH) {
      continue;
    }
    const context = { root, compilerOptions, fromFile: modulePath };
    const reExported = reExportSpecifiers(root, modulePath)
      .map((specifier) => resolveProjectModule(context, specifier))
      .filter((target) => target !== undefined && isSourceFile(target) && !found.has(target));
    for (const target of reExported) {
      found.add(target);
      pending.push({ modulePath: target, depth: depth + 1 });
    }
  }
  return [...found];
}
