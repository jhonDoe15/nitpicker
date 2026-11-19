import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CodeFolders } from '../../../../languages/typescript/preset/notices/empty-sources.mts';
import { parsedJsonc as untypedParsedJsonc } from '../../../../shared/jsonc/jsonc.mjs';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { fieldOf, isPlainObject, listOf } from '../../../../shared/values/readers.mts';
import { PROJECT_ROOT as untypedProjectRoot } from '../../../../languages/typescript/preset/layout/source-root/root-paths.mjs';

type ParsedJsonc = { readonly kind: string; readonly value?: unknown };

const parsedJsonc: (text: string) => ParsedJsonc = untypedParsedJsonc;
const resolveInside: (root: string, relative: string) => string | undefined = untypedResolveInside;

export const PROJECT_ROOT: string = untypedProjectRoot;

const ENTRY_FIELDS = ['main', 'module', 'bin', 'exports'];
const DEFAULT_ENTRY = /^index\.[cm]?[jt]sx?$/u;
const SCRIPT_AT_ROOT = /\.(?:js|cjs|mjs|jsx)$/u;
const TYPESCRIPT_AT_ROOT = /\.(?:ts|mts|cts)$/u;
const TSX_AT_ROOT = /\.tsx$/u;

function isRootCode(file: string, withTsx: boolean): boolean {
  return (
    SCRIPT_AT_ROOT.test(file) ||
    TYPESCRIPT_AT_ROOT.test(file) ||
    (withTsx && TSX_AT_ROOT.test(file))
  );
}

function manifestOf(projectRoot: string): Record<string, unknown> | undefined {
  const file = path.join(projectRoot, 'package.json');
  const parsed = existsSync(file) ? parsedJsonc(readFileSync(file, 'utf8')) : undefined;
  return parsed?.kind === 'json' && isPlainObject(parsed.value) ? parsed.value : undefined;
}

function childrenOf(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return listOf(value);
  }
  return isPlainObject(value) ? Object.values(value) : [];
}

function targetsIn(value: unknown): string[] {
  const pending: unknown[] = [value];
  for (const current of pending) {
    for (const child of childrenOf(current)) {
      pending.push(child);
    }
  }
  return pending.filter((entry): entry is string => typeof entry === 'string');
}

function rootFileTarget(projectRoot: string, target: string): boolean {
  const relative = path.posix.normalize(target.replaceAll('\\', '/'));
  const file = relative.includes('/') ? undefined : resolveInside(projectRoot, relative);
  return file !== undefined && isRootCode(relative, true) && existsSync(file);
}

function entryAtRoot(manifest: Record<string, unknown>, projectRoot: string): boolean {
  return ENTRY_FIELDS.flatMap((field) => targetsIn(fieldOf(manifest, field))).some((target) =>
    rootFileTarget(projectRoot, target),
  );
}

export function isRootLevelPackage(
  projectRoot: string,
  { folders, topFiles }: CodeFolders,
): boolean {
  const manifest = manifestOf(projectRoot);
  if (manifest === undefined || manifest['workspaces'] !== undefined || topFiles.length === 0) {
    return false;
  }
  return (
    entryAtRoot(manifest, projectRoot) ||
    topFiles.some((file) => DEFAULT_ENTRY.test(file) && isRootCode(file, false)) ||
    (folders.length === 0 && topFiles.some((file) => isRootCode(file, true)))
  );
}
