import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { pathInside, typescriptApi } from '../typed/mutation.mts';

export type ResolutionProject = {
  readonly root: string;
  readonly compilerOptions: readonly TypeScript.CompilerOptions[];
};

type ResolutionContext = ResolutionProject & { readonly fromFile: string };

const PROJECT_CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json'];
const MAX_RE_EXPORT_DEPTH = 3;

export function isFile(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function parsedConfig(configPath: string): TypeScript.ParsedCommandLine {
  const ts = typescriptApi();
  const read: { readonly config?: unknown } = ts.readConfigFile(configPath, (file) =>
    ts.sys.readFile(file),
  );
  const json = read.config ?? {};
  return ts.parseJsonConfigFileContent(
    json,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
}

function withResolutionDefaults(options: TypeScript.CompilerOptions): TypeScript.CompilerOptions {
  const ts = typescriptApi();
  return {
    allowJs: true,
    ...options,
    moduleResolution: options.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
  };
}

export function projectCompilerOptions(root: string): TypeScript.CompilerOptions[] {
  const ts = typescriptApi();
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

function projectRelative(
  realRoot: string,
  resolved: TypeScript.ResolvedModuleFull | undefined,
): string | undefined {
  if (resolved === undefined || resolved.isExternalLibraryImport === true) {
    return undefined;
  }
  const relative = path.relative(realRoot, realpathSync(resolved.resolvedFileName));
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? undefined
    : relative.replaceAll('\\', '/');
}

export function resolveProjectModule(
  { root, compilerOptions, fromFile }: ResolutionContext,
  specifier: string,
): string | undefined {
  const ts = typescriptApi();
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

function reExportSpecifiers(root: string, modulePath: string): string[] {
  const ts = typescriptApi();
  const full = pathInside(root, modulePath);
  if (full === undefined) {
    return [];
  }
  const text = readFileSync(full, 'utf8');
  return ts
    .createSourceFile(modulePath, text, ts.ScriptTarget.Latest)
    .statements.flatMap((statement) =>
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
        ? [statement.moduleSpecifier.text]
        : [],
    );
}

export function withReExportedModules(
  { root, compilerOptions }: ResolutionProject,
  modulePaths: readonly string[],
  isSourceFile: (modulePath: string) => boolean,
): string[] {
  const found = new Set(modulePaths);
  const pending = modulePaths.map((modulePath) => ({ modulePath, depth: 0 }));
  for (const { modulePath, depth } of pending) {
    if (depth >= MAX_RE_EXPORT_DEPTH) {
      continue;
    }
    const context = { root, compilerOptions, fromFile: modulePath };
    const reExported = reExportSpecifiers(root, modulePath)
      .map((specifier) => resolveProjectModule(context, specifier))
      .filter(
        (target): target is string =>
          target !== undefined && isSourceFile(target) && !found.has(target),
      );
    for (const target of reExported) {
      found.add(target);
      pending.push({ modulePath: target, depth: depth + 1 });
    }
  }
  return [...found];
}
