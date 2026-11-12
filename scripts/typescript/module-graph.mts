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
    .filter((file) => MODULE.test(file) && !FIXTURE.test(file));
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

function waits({ importer, target }: ModuleImport, converting: ReadonlySet<string>): boolean {
  return (
    isShipped(target) && isShipped(importer) && !isConverted(importer) && !converting.has(importer)
  );
}

export function blockingImporters(
  imports: readonly ModuleImport[],
  candidates: ReadonlySet<string>,
): Map<string, string[]> {
  const blocking = Map.groupBy(
    imports.filter(
      (moduleImport) => candidates.has(moduleImport.target) && waits(moduleImport, candidates),
    ),
    ({ target }) => target,
  );
  return new Map(
    [...blocking].map(([target, found]) => [target, found.map(({ importer }) => importer)]),
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
  return imports
    .filter((moduleImport) => moduleImport.target === file && waits(moduleImport, converting))
    .map(({ importer }) => importer);
}
