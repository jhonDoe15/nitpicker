import { existsSync, realpathSync, statSync } from 'node:fs';
import nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlainObject, listOf as untypedListOf } from '../../../../shared/config.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { isRealPathInside } from '../../../../shared/conventions/read-inside.mjs';
import { withDependencyCruiserFiles as untypedWithDependencyCruiserFiles } from './config-values.mjs';
import { importToolFile, toolFunction } from './typed/tool-modules.mts';

const listOf: (value: unknown) => unknown[] = untypedListOf;
const withDependencyCruiserFiles: (config: unknown, root: string) => unknown =
  untypedWithDependencyCruiserFiles;

const TOOL = 'dependency-cruiser';
const CONFIG_EXTENSIONS = ['', '.js', '.json', '.cjs', '.mjs', '.ts', '.cts', '.mts'];

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || path.isAbsolute(specifier) || specifier.startsWith('file:');
}

function isInside(root: string, file: string): boolean {
  return existsSync(file) && isRealPathInside(root, file);
}

function isProjectFile(root: string, file: string): boolean {
  return (
    isInside(root, file) && !realpathSync.native(file).split(path.sep).includes('node_modules')
  );
}

function containLocalImports(root: string): void {
  if (typeof nodeModule.registerHooks !== 'function') {
    return;
  }
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      const parent = context.parentURL?.startsWith('file:')
        ? fileURLToPath(context.parentURL)
        : undefined;
      const target = resolved.url.startsWith('file:') ? fileURLToPath(resolved.url) : undefined;
      if (
        parent !== undefined &&
        target !== undefined &&
        isLocalSpecifier(specifier) &&
        isProjectFile(root, parent) &&
        !isInside(root, target)
      ) {
        throw new Error(`${specifier} in ${path.relative(root, parent)} is outside the project`);
      }
      return resolved;
    },
  });
}

function extendedFile(target: string, from: string): string {
  const base = target.startsWith('file:') ? fileURLToPath(target) : path.resolve(from, target);
  return (
    CONFIG_EXTENSIONS.map((extension) => `${base}${extension}`).find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? base
  );
}

function containedExtends(root: string, current: string, config: unknown): string[] {
  const local = listOf(isPlainObject(config) ? fieldOf(config, 'extends') : undefined).filter(
    (target): target is string => typeof target === 'string' && isLocalSpecifier(target),
  );
  return local.flatMap((target) => {
    const extended = extendedFile(target, path.dirname(current));
    if (!existsSync(extended)) {
      return [];
    }
    if (!isRealPathInside(root, extended)) {
      throw new Error(
        `"extends": "${target}" in ${path.relative(root, current)} is outside the project`,
      );
    }
    return [extended];
  });
}

async function assertContainedExtends(
  root: string,
  file: string,
  readConfig: (file: string) => unknown,
): Promise<void> {
  const pending = [file];
  const seen = new Set();
  for (const current of pending) {
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    pending.push(...containedExtends(root, current, await readConfig(current)));
  }
}

export async function loadDependencyCruiserConfig(loader: unknown, file: string): Promise<unknown> {
  const root = process.cwd();
  containLocalImports(root);
  const readConfig = await importToolFile(
    TOOL,
    'src/config-utl/extract-depcruise-config/read-config.mjs',
  );
  await assertContainedExtends(root, file, toolFunction(readConfig, 'default'));
  return withDependencyCruiserFiles(await toolFunction(loader, 'default')(file), root);
}
