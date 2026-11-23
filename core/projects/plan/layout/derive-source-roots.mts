import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  codeExtensionNames,
  resolveLayoutFor as untypedResolveLayoutFor,
} from '../../../../languages/typescript/preset/layout.mts';
import {
  PROJECT_ROOT,
  normalizeRoot,
} from '../../../../languages/typescript/preset/layout/source-root/root-paths.mts';
import type { Layout } from '../../../../languages/typescript/adapters/typed/head-policy.mts';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mts';
import { parsedJsonc as untypedParsedJsonc } from '../../../../shared/jsonc/jsonc.mts';
import { fieldOf, isPlainObject, listOf } from '../../../../shared/values/readers.mts';

type ParsedJsonc = { readonly kind: string; readonly value?: unknown };

const parsedJsonc: (text: string) => ParsedJsonc = untypedParsedJsonc;
const resolveInside: (root: string, relative: string) => string | undefined = untypedResolveInside;
const resolveLayoutFor: (policy: object) => Layout = untypedResolveLayoutFor;

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);
const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const TOOL_CONFIG = /(?:^|\/)[^/]*\.config\.[cm]?[jt]sx?$/u;
const SKIPPED_FOLDERS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'test',
  'tests',
  '__tests__',
  'fixtures',
  '__fixtures__',
  'scripts',
  'docs',
  'examples',
  'example',
  'bench',
  'benchmark',
  'benchmarks',
]);

export type DeriveLayoutInput = {
  readonly projectRoot: string;
  readonly preset: string;
  readonly exclude?: readonly string[] | undefined;
};

type CheckContext = {
  readonly preset: string;
  readonly exclude?: readonly string[] | undefined;
};

function isDirectory(target: string): boolean {
  return existsSync(target) && statSync(target).isDirectory();
}

function isFile(target: string): boolean {
  return existsSync(target) && statSync(target).isFile();
}

function readJsonObject(file: string): Record<string, unknown> | undefined {
  if (!isFile(file)) {
    return undefined;
  }
  const parsed = parsedJsonc(readFileSync(file, 'utf8'));
  return parsed.kind === 'json' && isPlainObject(parsed.value) ? parsed.value : undefined;
}

function isSourceFile(relative: string): boolean {
  return (
    CODE_FILE.test(relative) && !DECLARATION_FILE.test(relative) && !TOOL_CONFIG.test(relative)
  );
}

function isSkippedFolder(relative: string): boolean {
  const segments = normalizeRoot(relative).split('/');
  return segments.some((segment) => segment.startsWith('.') || SKIPPED_FOLDERS.has(segment));
}

function parentFolder(relative: string): string {
  const folder = path.posix.dirname(relative);
  return folder === '.' ? PROJECT_ROOT : normalizeRoot(folder);
}

function normalizedRelative(raw: string): string | undefined {
  const cleaned = raw.replaceAll('\\', '/').replace(/^\.\//u, '').trim();
  if (cleaned === '' || cleaned.startsWith('/') || cleaned.startsWith('..')) {
    return undefined;
  }
  return cleaned;
}

function isRootGlob(pattern: string): boolean {
  return (
    pattern === PROJECT_ROOT ||
    pattern === '*' ||
    pattern === '**' ||
    pattern.startsWith('*.') ||
    pattern.startsWith('**/')
  );
}

function rootFromPath(projectRoot: string, candidate: string): string | undefined {
  const resolved = resolveInside(projectRoot, candidate);
  if (resolved === undefined || !existsSync(resolved)) {
    return undefined;
  }
  if (isDirectory(resolved)) {
    const folder = normalizeRoot(candidate);
    return folder === PROJECT_ROOT || !isSkippedFolder(folder) ? folder : undefined;
  }
  if (!isFile(resolved) || !isSourceFile(candidate)) {
    return undefined;
  }
  const folder = parentFolder(candidate);
  return folder === PROJECT_ROOT || !isSkippedFolder(folder) ? folder : undefined;
}

function rootFromPattern(projectRoot: string, raw: string): string | undefined {
  const normalized = normalizedRelative(raw);
  if (normalized === undefined) {
    return undefined;
  }
  if (isRootGlob(normalized)) {
    return PROJECT_ROOT;
  }
  const prefix = normalized.replace(/\/?[*?[{].*$/u, '').replace(/\/+$/u, '');
  if (prefix === '' || prefix === PROJECT_ROOT) {
    return PROJECT_ROOT;
  }
  return rootFromPath(projectRoot, prefix);
}

function collapseRoots(candidates: readonly string[]): string[] {
  const unique = [...new Set(candidates)];
  if (unique.includes(PROJECT_ROOT)) {
    return [PROJECT_ROOT];
  }
  const sorted = unique.sort();
  return sorted.filter(
    (root) => !sorted.some((other) => other !== root && root.startsWith(`${other}/`)),
  );
}

function hasCodeUnder(
  projectRoot: string,
  sourceRoots: readonly string[],
  context: CheckContext,
): boolean {
  const policy = {
    ...(context.preset === 'javascript' ? { preset: 'javascript' } : {}),
    layout: { sourceRoots },
    ...(context.exclude === undefined ? {} : { exclude: context.exclude }),
  };
  const layout = resolveLayoutFor(policy);
  return layout
    .projectCodeFiles(projectRoot, sourceRoots)
    .some((file) => !layout.isTestFile(file) && !DECLARATION_FILE.test(file));
}

function validRoots(
  projectRoot: string,
  candidates: readonly string[],
  context: CheckContext,
): string[] | undefined {
  const roots = collapseRoots(candidates);
  return roots.length > 0 && hasCodeUnder(projectRoot, roots, context) ? roots : undefined;
}

function fromTsconfig(projectRoot: string, context: CheckContext): string[] | undefined {
  const tsconfig = readJsonObject(path.join(projectRoot, 'tsconfig.json'));
  if (tsconfig === undefined) {
    return undefined;
  }
  const entries = [
    ...listOf(fieldOf(tsconfig, 'include')),
    ...listOf(fieldOf(tsconfig, 'files')),
  ].filter((entry): entry is string => typeof entry === 'string');
  const candidates = entries
    .map((entry) => rootFromPattern(projectRoot, entry))
    .filter((entry): entry is string => entry !== undefined);
  return validRoots(projectRoot, candidates, context);
}

function targetsIn(value: unknown): string[] {
  const found: string[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === 'string') {
      found.push(item);
    } else if (Array.isArray(item)) {
      stack.push(...listOf(item));
    } else if (isPlainObject(item)) {
      stack.push(...Object.values(item));
    }
  }
  return found.toReversed();
}

function fromPackageJson(projectRoot: string, context: CheckContext): string[] | undefined {
  const manifest = readJsonObject(path.join(projectRoot, 'package.json'));
  if (manifest === undefined) {
    return undefined;
  }
  const targets = ['main', 'module', 'exports'].flatMap((field) =>
    targetsIn(fieldOf(manifest, field)),
  );
  const candidates = targets
    .map((target) => rootFromPattern(projectRoot, target))
    .filter((entry): entry is string => entry !== undefined);
  return validRoots(projectRoot, candidates, context);
}

export function deriveSourceRoots({
  projectRoot,
  preset,
  exclude,
}: DeriveLayoutInput): readonly string[] | undefined {
  if (
    !SCRIPT_PRESETS.has(preset) ||
    !existsSync(projectRoot) ||
    isDirectory(path.join(projectRoot, 'src'))
  ) {
    return undefined;
  }
  const context: CheckContext = { preset, exclude };
  return (
    fromTsconfig(projectRoot, context) ??
    fromPackageJson(projectRoot, context) ??
    (hasCodeUnder(projectRoot, [PROJECT_ROOT], context) ? [PROJECT_ROOT] : undefined)
  );
}
