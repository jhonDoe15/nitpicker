import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { ancestorDirectories as untypedAncestorDirectories } from '../../../../shared/filesystem.mjs';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { packageName } from '../modules/specifiers/package-name.mts';

export type ConfigContext = {
  readonly root: string;
  readonly repository: string;
  readonly realRepository: string;
  readonly offset: string;
};

export type Located =
  | { readonly kind: 'outside'; readonly target: string }
  | { readonly kind: 'broken' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'file'; readonly full: string };

export type PackageFacts = { version?: string; workspace?: string[] };

const resolveInside: (root: string, relative: string) => string | undefined = untypedResolveInside;
const ancestorDirectories: (directory: string) => string[] = untypedAncestorDirectories;

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;
const BUILTINS = new Set(builtinModules);

function repositoryRoot(projectRoot: string): string {
  const root = path.resolve(projectRoot);
  return (
    ancestorDirectories(root).find((directory) => existsSync(path.join(directory, '.git'))) ?? root
  );
}

export function contextOf(projectRoot: string): ConfigContext {
  const root = path.resolve(projectRoot);
  const repository = repositoryRoot(root);
  return {
    root,
    repository,
    realRepository: realpathSync(repository),
    offset: path.relative(repository, root),
  };
}

function isWithin(base: string, file: string): boolean {
  return file.startsWith(base + path.sep);
}

export function located(context: ConfigContext, relative: string): Located {
  const full = resolveInside(context.repository, path.join(context.offset, relative));
  if (full === undefined) {
    return { kind: 'outside', target: path.resolve(context.root, relative) };
  }
  if (!existsSync(full)) {
    return { kind: isBrokenLink(full) ? 'broken' : 'absent' };
  }
  const real = realpathSync(full);
  if (!isWithin(context.realRepository, real)) {
    return { kind: 'outside', target: real };
  }
  return statSync(real).isFile() ? { kind: 'file', full } : { kind: 'absent' };
}

function isBrokenLink(full: string): boolean {
  const parent = path.dirname(full);
  return (
    existsSync(parent) &&
    statSync(parent).isDirectory() &&
    lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink() === true
  );
}

function projectRelative(context: ConfigContext, full: string): string {
  return path.relative(context.root, full).split(path.sep).join('/');
}

export function isBuiltin(specifier: string): boolean {
  return specifier.startsWith('node:') || BUILTINS.has(packageName(specifier));
}

function resolvedEntry(full: string, specifier: string): { entry?: string; error?: unknown } {
  try {
    return { entry: createRequire(full).resolve(specifier) };
  } catch (error) {
    return { error };
  }
}

function installedPackage(directory: string, name: string): string | undefined {
  const modules = path.join(directory, 'node_modules');
  const manifest = path.resolve(modules, name, 'package.json');
  if (!manifest.startsWith(modules + path.sep)) {
    return undefined;
  }
  return existsSync(manifest) ? path.dirname(manifest) : undefined;
}

function packageDirectory(full: string, name: string): string | undefined {
  return ancestorDirectories(path.dirname(full))
    .map((directory) => installedPackage(directory, name))
    .find((candidate) => candidate !== undefined);
}

export function packageFacts(
  context: ConfigContext,
  full: string,
  specifier: string,
): PackageFacts {
  const name = packageName(specifier);
  const directory = packageDirectory(full, name);
  if (directory === undefined) {
    return { version: `${name}@missing` };
  }
  const real = realpathSync(directory);
  const manifest = path.join(real, 'package.json');
  if (!isWorkspaceFile(context, real)) {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    const version = fieldOf(parsed, 'version');
    return { version: `${name}@${version === undefined ? 'unversioned' : textOf(version)}` };
  }
  const { entry } = resolvedEntry(full, specifier);
  const files = [manifest, entry].filter(
    (file): file is string => file !== undefined && isWorkspaceFile(context, realpathSync(file)),
  );
  return {
    workspace: files.map((file) =>
      projectRelative(
        context,
        path.join(context.repository, path.relative(context.realRepository, realpathSync(file))),
      ),
    ),
  };
}

function isWorkspaceFile(context: ConfigContext, real: string): boolean {
  return isWithin(context.realRepository, real) && !real.includes(NODE_MODULES);
}
