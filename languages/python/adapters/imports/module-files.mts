import type { Dirent } from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cachedValue } from '../../../../shared/values/caching/cached-value.mts';
import type { ModuleCaches, ModuleFiles } from './typed/import-scan-types.mts';

const MODULE_FILE = /\.(?:py|pyi|pyw|pyx|pxd|pyc|so|pyd)$/u;
const PACKAGE_REWIRING = /__path__|sys\.modules|declare_namespace/u;
const INIT = '__init__.py';

function projectPath(projectRoot: string, relative: string): string | undefined {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, relative);
  if (full !== base && !full.startsWith(`${base}${path.sep}`)) {
    return undefined;
  }
  return full;
}

function entries(caches: ModuleCaches, directory: string): Dirent[] {
  return cachedValue(caches.listings, directory, () =>
    existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : [],
  );
}

function moduleEntry(
  caches: ModuleCaches,
  directory: string,
  { name, last }: { readonly name: string; readonly last: boolean },
): Dirent | undefined {
  return entries(caches, directory).find((entry) =>
    entry.name === name
      ? !entry.isFile()
      : last && entry.name.startsWith(`${name}.`) && MODULE_FILE.test(entry.name),
  );
}

function rewires(caches: ModuleCaches, file: string): boolean {
  return cachedValue(
    caches.rewiring,
    file,
    () => existsSync(file) && PACKAGE_REWIRING.test(readFileSync(file, 'utf8')),
  );
}

function rewiresModule(caches: ModuleCaches, directory: string, name: string): boolean {
  const entry = entries(caches, directory).find((candidate) => candidate.name === `${name}.py`);
  return entry !== undefined && rewires(caches, path.join(directory, entry.name));
}

function missingFrom(caches: ModuleCaches, start: string, parts: readonly string[]): number {
  let directory = start;
  for (const [index, name] of parts.entries()) {
    if (rewires(caches, path.join(directory, INIT))) {
      return -1;
    }
    const entry = moduleEntry(caches, directory, { name, last: index === parts.length - 1 });
    if (entry === undefined) {
      return rewiresModule(caches, directory, name) ? -1 : index;
    }
    directory = path.join(directory, entry.name);
  }
  return -1;
}

export function createModuleFiles(projectRoot: string): ModuleFiles {
  const caches: ModuleCaches = { listings: new Map(), rewiring: new Map() };
  function inside(relative: string): string | undefined {
    return projectPath(projectRoot, relative);
  }
  return {
    missingPart(relative, parts) {
      const start = inside(relative);
      return start === undefined ? -1 : missingFrom(caches, start, parts);
    },
    hasModule(relative, name) {
      const directory = inside(relative);
      return (
        directory !== undefined &&
        moduleEntry(caches, directory, { name, last: true }) !== undefined
      );
    },
    isRegularPackage(relative) {
      const directory = inside(relative);
      return (
        directory !== undefined && entries(caches, directory).some(({ name }) => name === INIT)
      );
    },
    rewires(relative) {
      const file = inside(relative);
      return file !== undefined && rewires(caches, file);
    },
  };
}
