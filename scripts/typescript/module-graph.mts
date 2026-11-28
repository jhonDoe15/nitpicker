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

const GIT_TIMEOUT_MS = 60_000;
const GIT_LISTING_BYTES = 256 * 1024 * 1024;
const MODULE = /\.(?:mjs|mts|cjs)$/u;
const FIXTURE = /(?:^|\/)fixtures\//u;
const MODULE_URL = /new URL\(\s*(['"])(?<specifier>[^'"]+)\1,\s*import\.meta\.url/gu;
const NODE_22_14_SCRIPTS = ['scripts/typescript/emit.mjs', 'scripts/reference/gen-rules.mjs'];

function repositoryFile(root: string, file: string): string {
  const full = path.resolve(root, file);
  if (!full.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`${file} is outside the repository`);
  }
  return full;
}

export function trackedModules(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_LISTING_BYTES,
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

function isConverted(file: string): boolean {
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
  const found = new Set(NODE_22_14_SCRIPTS);
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
  return [...nodeBuildModules(imports)]
    .map((file) => (tracked.has(file) ? file : file.replace(/\.mjs$/u, '.mts')))
    .filter((file) => isConverted(file) && tracked.has(file));
}

function unwrappedReferences(root: string, file: string): string[] {
  const lines = readFileSync(repositoryFile(root, file), 'utf8').split(/\r?\n/u);
  return lines.flatMap((line, index) =>
    [...line.matchAll(MODULE_URL)].flatMap((match) => {
      const specifier = match.groups?.['specifier'] ?? '';
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const source = target.replace(/\.mjs$/u, '.mts');
      const breaks =
        source !== target &&
        !line.includes('checkoutModuleUrl(') &&
        !(lines[index - 1] ?? '').trimEnd().endsWith('checkoutModuleUrl(') &&
        !existsSync(repositoryFile(root, target)) &&
        existsSync(repositoryFile(root, source));
      return breaks ? [`${file}:${String(index + 1)} ${specifier}`] : [];
    }),
  );
}

export function unwrappedModuleUrls(root: string, modules: readonly string[]): string[] {
  return modules.flatMap((file) => unwrappedReferences(root, file));
}
