import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { checkoutModulePath } from './paths/checkout-module.mts';

const RELATIVE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(['"])(\.{1,2}\/[^'"]+)\1/gmu;
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/u;

export function importedFiles(relativePath: string, source: string, root: string): string[] {
  return [...source.matchAll(RELATIVE_SPECIFIER)]
    .map((match) => match[2] ?? '')
    .map((name) => path.resolve(root, path.dirname(relativePath), name.split(/[?#]/u)[0] ?? ''))
    .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())
    .map((absolute) => path.relative(root, absolute).split(path.sep).join('/'))
    .filter((relative) => relative !== '..' && !relative.startsWith('../'));
}

export function importClosure(
  relativePaths: Iterable<string>,
  root: string,
  { stopAt = new Set<string>() }: { readonly stopAt?: ReadonlySet<string> } = {},
): Map<string, string> {
  const files = new Map<string, string>();
  const pending = [...relativePaths];
  for (const relativePath of pending) {
    if (files.has(relativePath)) {
      continue;
    }
    const contents = readFileSync(checkoutModulePath(path.join(root, relativePath)), 'utf8');
    files.set(relativePath, contents);
    if (!SCRIPT_FILE.test(relativePath) || stopAt.has(relativePath)) {
      continue;
    }
    for (const imported of importedFiles(relativePath, contents, root)) {
      pending.push(imported);
    }
  }
  return files;
}
