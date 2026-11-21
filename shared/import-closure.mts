import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { checkoutModulePath } from './paths/checkout-module.mts';

const RELATIVE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(['"])(\.{1,2}\/[^'"]+)\1/gmu;
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/u;

type VisitedFile = { readonly contents: string; readonly imports: readonly string[] };
type Visit = (relativePath: string) => VisitedFile;

export function importedFiles(relativePath: string, source: string, root: string): string[] {
  return [...source.matchAll(RELATIVE_SPECIFIER)]
    .map((match) => match[2] ?? '')
    .map((name) => path.resolve(root, path.dirname(relativePath), name.split(/[?#]/u)[0] ?? ''))
    .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())
    .map((absolute) => path.relative(root, absolute).split(path.sep).join('/'))
    .filter((relative) => relative !== '..' && !relative.startsWith('../'));
}

function visitOf(root: string, stopAt: ReadonlySet<string>): Visit {
  return (relativePath) => {
    const contents = readFileSync(checkoutModulePath(path.join(root, relativePath)), 'utf8');
    const follows = SCRIPT_FILE.test(relativePath) && !stopAt.has(relativePath);
    return { contents, imports: follows ? importedFiles(relativePath, contents, root) : [] };
  };
}

function walk(relativePaths: Iterable<string>, visit: Visit): Map<string, string> {
  const files = new Map<string, string>();
  const pending = [...relativePaths];
  for (const relativePath of pending) {
    if (files.has(relativePath)) {
      continue;
    }
    const { contents, imports } = visit(relativePath);
    files.set(relativePath, contents);
    for (const imported of imports) {
      pending.push(imported);
    }
  }
  return files;
}

export function importClosure(
  relativePaths: Iterable<string>,
  root: string,
  { stopAt = new Set<string>() }: { readonly stopAt?: ReadonlySet<string> } = {},
): Map<string, string> {
  return walk(relativePaths, visitOf(root, stopAt));
}

export function unchangingImportClosure(
  root: string,
): (relativePaths: Iterable<string>) => Map<string, string> {
  const visited = new Map<string, VisitedFile>();
  const visit = visitOf(root, new Set());
  function remembered(relativePath: string): VisitedFile {
    const known = visited.get(relativePath);
    if (known !== undefined) {
      return known;
    }
    const file = visit(relativePath);
    visited.set(relativePath, file);
    return file;
  }
  return (relativePaths) => walk(relativePaths, remembered);
}
