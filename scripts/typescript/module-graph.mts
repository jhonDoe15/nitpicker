import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import typescript from 'typescript';
import { isShippedPath as isShipped } from './emit.mjs';

export type ModuleImport = {
  readonly importer: string;
  readonly specifier: string;
  readonly target: string;
  readonly start: number;
};

export type Output = { write(text: string): void };

export const GIT_TIMEOUT_MS = 60_000;
const MODULE = /\.(?:mjs|mts|cjs)$/u;
const FIXTURE = /(?:^|\/)fixtures\//u;
const MODULE_URL = /new URL\(\s*(['"])(?<specifier>[^'"]+)\1,\s*import\.meta\.url/gu;
const NODE_22_14_SCRIPTS = ['scripts/typescript/emit.mjs', 'scripts/reference/gen-rules.mjs'];
const NODE_22_14_LOADED = [
  'languages/typescript/preset/defaults/eslint.config.mjs',
  'languages/typescript/preset/eslint-config/policies/errors.config.mjs',
  'languages/typescript/preset/eslint-config/policies/logging.config.mjs',
  'languages/typescript/preset/eslint-config/policies/module-effects.config.mjs',
  'languages/typescript/preset/eslint-config/policies/coding-standards.config.mjs',
];
const NODE_22_14_BUILD = 'the package build on Node.js 22.14';

export function repositoryFile(root: string, file: string): string {
  const base = path.resolve(root);
  const full = path.resolve(base, file);
  if (!full.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${file} is outside the repository`);
  }
  return full;
}

export function writeLines(output: Output, lines: readonly string[]): void {
  output.write(`${lines.join('\n')}\n`);
}

export function trackedModules(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  })
    .split('\0')
    .filter((file) => MODULE.test(file) && !FIXTURE.test(file))
    .filter((file) => existsSync(repositoryFile(root, file)));
}

function importsOf(root: string, importer: string): ModuleImport[] {
  const text = readFileSync(repositoryFile(root, importer), 'utf8');
  return typescript
    .preProcessFile(text, true, true)
    .importedFiles.filter(({ fileName }) => fileName.startsWith('./') || fileName.startsWith('../'))
    .map(({ fileName, pos }) => ({
      importer,
      specifier: fileName,
      target: path.posix.normalize(path.posix.join(path.posix.dirname(importer), fileName)),
      start: text.indexOf(fileName, pos),
    }));
}

export function moduleImports(root: string, modules: readonly string[]): ModuleImport[] {
  return modules.flatMap((importer) => importsOf(root, importer));
}

export function isConverted(file: string): boolean {
  return file.endsWith('.mts');
}

export function shippedTypeScriptImports(imports: readonly ModuleImport[]): ModuleImport[] {
  return imports.filter(
    ({ importer, target }) => isShipped(importer) && !isConverted(importer) && isConverted(target),
  );
}

export function unresolvedTypeScriptImports(
  root: string,
  imports: readonly ModuleImport[],
): ModuleImport[] {
  return imports.filter(
    ({ importer, target }) => isConverted(importer) && !existsSync(repositoryFile(root, target)),
  );
}

export function doubledModules(modules: readonly string[]): string[] {
  const names = new Set(modules);
  return modules.filter((file) => isConverted(file) && names.has(file.replace(/\.mts$/u, '.mjs')));
}

function nodeBuildModules(imports: readonly ModuleImport[]): Set<string> {
  const byImporter = Map.groupBy(imports, ({ importer }) => importer);
  const found = new Set([...NODE_22_14_SCRIPTS, ...NODE_22_14_LOADED]);
  for (const file of found) {
    const next = isShipped(file) ? [] : (byImporter.get(file) ?? []);
    for (const { target } of next) {
      found.add(target);
    }
  }
  return found;
}

export function convertedNodeBuildModules(
  modules: readonly string[],
  imports: readonly ModuleImport[],
): string[] {
  const tracked = new Set(modules);
  return [...nodeBuildModules(imports)].filter((file) => isConverted(file) || !tracked.has(file));
}

function runsOnNodeBuild(importer: string, build: ReadonlySet<string>): boolean {
  return build.has(importer) && !isShipped(importer);
}

function waits(
  { importer, target }: ModuleImport,
  converting: ReadonlySet<string>,
  build: ReadonlySet<string>,
): boolean {
  return (
    runsOnNodeBuild(importer, build) ||
    (isShipped(target) &&
      isShipped(importer) &&
      !isConverted(importer) &&
      !converting.has(importer))
  );
}

function importerName(importer: string, build: ReadonlySet<string>): string {
  return runsOnNodeBuild(importer, build) ? `${importer} on Node.js 22.14` : importer;
}

type ImportGraph = {
  readonly byTarget: ReadonlyMap<string, readonly ModuleImport[]>;
  readonly build: ReadonlySet<string>;
};

function importGraph(imports: readonly ModuleImport[]): ImportGraph {
  return {
    byTarget: Map.groupBy(imports, ({ target }) => target),
    build: nodeBuildModules(imports),
  };
}

function waitingImporters(
  { byTarget, build }: ImportGraph,
  file: string,
  converting: ReadonlySet<string>,
): string[] {
  const roots =
    NODE_22_14_SCRIPTS.includes(file) || NODE_22_14_LOADED.includes(file) ? [NODE_22_14_BUILD] : [];
  return [
    ...roots,
    ...(byTarget.get(file) ?? [])
      .filter((moduleImport) => waits(moduleImport, converting, build))
      .map(({ importer }) => importerName(importer, build)),
  ];
}

export function blockingImporters(
  imports: readonly ModuleImport[],
  candidates: ReadonlySet<string>,
): Map<string, string[]> {
  const graph = importGraph(imports);
  return new Map(
    [...candidates]
      .map((file): [string, string[]] => [file, waitingImporters(graph, file, candidates)])
      .filter(([, importers]) => importers.length > 0),
  );
}

export function convertibleTogether(
  imports: readonly ModuleImport[],
  candidates: Iterable<string>,
): Set<string> {
  const rounds = [new Set(candidates)];
  for (const convertible of rounds) {
    const blocked = blockingImporters(imports, convertible);
    if (blocked.size === 0) {
      return convertible;
    }
    rounds.push(new Set([...convertible].filter((file) => !blocked.has(file))));
  }
  return new Set();
}

export function waitingOn(
  imports: readonly ModuleImport[],
  file: string,
  converting: ReadonlySet<string>,
): string[] {
  return waitingImporters(importGraph(imports), file, converting);
}

function unwrappedReferences(root: string, file: string): string[] {
  const lines = readFileSync(repositoryFile(root, file), 'utf8').split('\n');
  return lines.flatMap((line, index) =>
    [...line.matchAll(MODULE_URL)].flatMap((match) => {
      const specifier = match.groups?.['specifier'] ?? '';
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const source = target.replace(/\.mjs$/u, '.mts');
      const breaks =
        source !== target &&
        !line.includes('checkoutModuleUrl(') &&
        !existsSync(repositoryFile(root, target)) &&
        existsSync(repositoryFile(root, source));
      return breaks ? [`${file}:${String(index + 1)} ${specifier}`] : [];
    }),
  );
}

export function unwrappedModuleUrls(root: string, modules: readonly string[]): string[] {
  return modules.flatMap((file) => unwrappedReferences(root, file));
}
