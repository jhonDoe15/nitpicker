import { existsSync, realpathSync, statSync } from 'node:fs';
import nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPlainObject, listOf } from '../../../../shared/config.mjs';
import { isRealPathInside } from '../../../../shared/conventions/read-inside.mjs';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { withDependencyCruiserFiles } from './config-values.mjs';

const TOOL = 'dependency-cruiser';
const CONFIG_EXTENSIONS = ['', '.js', '.json', '.cjs', '.mjs', '.ts', '.cts', '.mts'];

function isLocalSpecifier(specifier) {
  return specifier.startsWith('.') || path.isAbsolute(specifier) || specifier.startsWith('file:');
}

function isInside(root, file) {
  return existsSync(file) && isRealPathInside(root, file);
}

function isProjectFile(root, file) {
  return (
    isInside(root, file) && !realpathSync.native(file).split(path.sep).includes('node_modules')
  );
}

function containLocalImports(root) {
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

function extendedFile(target, from) {
  const base = target.startsWith('file:') ? fileURLToPath(target) : path.resolve(from, target);
  return (
    CONFIG_EXTENSIONS.map((extension) => `${base}${extension}`).find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? base
  );
}

function containedExtends(root, current, config) {
  const local = listOf(isPlainObject(config) ? config.extends : undefined).filter(
    (target) => typeof target === 'string' && isLocalSpecifier(target),
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

async function assertContainedExtends(root, file, readConfig) {
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

export async function loadDependencyCruiserConfig(loader, file) {
  const root = process.cwd();
  containLocalImports(root);
  const readConfig = await import(
    pathToFileURL(
      resolveTool(TOOL, { bin: 'src/config-utl/extract-depcruise-config/read-config.mjs' }).binPath,
    ).href
  );
  await assertContainedExtends(root, file, readConfig.default);
  return withDependencyCruiserFiles(await loader.default(file), root);
}
