import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject, textOf } from '../../../../shared/values/readers.mts';
import type { DependencyUnit } from '../../project-types.mts';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const LOCAL_SPECIFIER = /^(?:file|link|portal):(?<target>.+)$/u;
const ALIAS_SPECIFIER = /^npm:(?<name>@?[^@]+)/u;

function neededNames([name, specifier]: readonly [string, unknown]): string[] {
  const alias = ALIAS_SPECIFIER.exec(textOf(specifier))?.groups?.['name'];
  return alias === undefined ? [`npm:${name}`] : [`npm:${name}`, `npm:${alias}`];
}

function parsedManifest(file: string): { readonly value: unknown; readonly unreadable?: true } {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

function readManifest(directory: string): unknown {
  const file = path.join(directory, 'package.json');
  return existsSync(file) ? parsedManifest(file).value : undefined;
}

function declaredDependencies(manifest: Record<string, unknown>): [string, unknown][] {
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const table = manifest[field];
    return isPlainObject(table) ? Object.entries(table) : [];
  });
}

export function javascriptUnit(directory: string): DependencyUnit | undefined {
  const manifest = readManifest(directory);
  if (!isPlainObject(manifest)) {
    return undefined;
  }
  const dependencies = declaredDependencies(manifest);
  const name = manifest['name'];
  return {
    names: typeof name === 'string' ? [`npm:${name}`] : [],
    needs: dependencies.flatMap(neededNames),
    folders: dependencies.flatMap(([, specifier]) => {
      const target = LOCAL_SPECIFIER.exec(textOf(specifier))?.groups?.['target'];
      return target === undefined ? [] : [target];
    }),
  };
}

function readProjectJson(directory: string): unknown {
  const file = path.join(directory, 'project.json');
  return existsSync(file) ? parsedManifest(file).value : undefined;
}

export function nxUnit(directory: string): DependencyUnit | undefined {
  const project = readProjectJson(directory);
  if (!isPlainObject(project)) {
    return undefined;
  }
  const declared = project['name'];
  const name = typeof declared === 'string' ? declared : path.basename(directory);
  const listed = project['implicitDependencies'];
  const implicit: unknown[] = Array.isArray(listed) ? listed : [];
  return {
    names: [`nx:${name}`],
    needs: implicit
      .filter((dependency): dependency is string => typeof dependency === 'string')
      .filter((dependency) => !/[!*]/u.test(dependency))
      .map((dependency) => `nx:${dependency}`),
    folders: [],
  };
}
