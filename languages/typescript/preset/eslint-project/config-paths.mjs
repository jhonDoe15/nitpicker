import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;
const BUILTINS = new Set(builtinModules);

function repositoryRoot(projectRoot) {
  let directory = path.resolve(projectRoot);
  while (!existsSync(path.join(directory, '.git'))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      return path.resolve(projectRoot);
    }
    directory = parent;
  }
  return directory;
}

export function contextOf(projectRoot) {
  const root = path.resolve(projectRoot);
  const repository = repositoryRoot(root);
  return {
    root,
    repository,
    realRepository: realpathSync(repository),
    offset: path.relative(repository, root),
  };
}

function isWithin(base, file) {
  return file.startsWith(base + path.sep);
}

export function located(context, relative) {
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

function isBrokenLink(full) {
  const parent = path.dirname(full);
  return (
    existsSync(parent) &&
    statSync(parent).isDirectory() &&
    lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink() === true
  );
}

function projectRelative(context, full) {
  return path.relative(context.root, full).split(path.sep).join('/');
}

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export function isBuiltin(specifier) {
  return specifier.startsWith('node:') || BUILTINS.has(packageName(specifier));
}

function resolvedEntry(full, specifier) {
  try {
    return { entry: createRequire(full).resolve(specifier) };
  } catch (error) {
    return { error };
  }
}

function packageDirectory(full, name) {
  let directory = path.dirname(full);
  for (;;) {
    const candidate = path.join(directory, 'node_modules', ...name.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

export function packageFacts(context, full, specifier) {
  const name = packageName(specifier);
  const directory = packageDirectory(full, name);
  if (directory === undefined) {
    return { version: `${name}@missing` };
  }
  const real = realpathSync(directory);
  const manifest = path.join(real, 'package.json');
  if (!isWorkspaceFile(context, real)) {
    const { version = 'unversioned' } = JSON.parse(readFileSync(manifest, 'utf8'));
    return { version: `${name}@${version}` };
  }
  const { entry } = resolvedEntry(full, specifier);
  const files = [manifest, entry].filter(
    (file) => file !== undefined && isWorkspaceFile(context, realpathSync(file)),
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

function isWorkspaceFile(context, real) {
  return isWithin(context.realRepository, real) && !real.includes(NODE_MODULES);
}
