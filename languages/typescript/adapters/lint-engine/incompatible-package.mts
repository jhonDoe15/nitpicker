import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TROUBLESHOOTING_ANCHORS } from '../../../../../shared/messages/troubleshooting.mjs';
import { withTroubleshooting } from '../typed/tools.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

type PackageInfo = {
  readonly name: string;
  readonly version: string;
  readonly eslintRange: string;
};

const FRAME_PATH = /([^\s()]*node_modules[^\s()]*?):\d+:\d+/gu;
const COMPARATOR = /^(>=|<=|>|<|\^|~|=)?v?(\d+|x|\*)/u;

export const INCOMPATIBLE_MARKER = 'cannot run with ESLint';

function runningMajor(): number {
  const version = fieldOf(createRequire(import.meta.url)('eslint/package.json'), 'version');
  return Number.parseInt(String(version), 10);
}

const COMPARISONS: Readonly<Record<string, (major: number, wanted: number) => boolean>> = {
  '>=': (major, wanted) => major >= wanted,
  '>': (major, wanted) => major >= wanted,
  '<': (major, wanted) => major < wanted,
  '<=': (major, wanted) => major <= wanted,
};

function sameMajor(major: number, wanted: number): boolean {
  return major === wanted;
}

function comparatorAccepts(comparator: string, major: number): boolean {
  const match = COMPARATOR.exec(comparator);
  if (match === null || match[2] === 'x' || match[2] === '*') {
    return true;
  }
  const compare = COMPARISONS[match[1] ?? ''] ?? sameMajor;
  return compare(major, Number(match[2]));
}

export function rangeAcceptsMajor(range: string, major: number): boolean {
  return range.split('||').some((alternative) =>
    alternative
      .trim()
      .split(/\s+/u)
      .every((comparator) => comparatorAccepts(comparator, major)),
  );
}

function manifestAt(directory: string): PackageInfo | undefined {
  const manifest = path.join(directory, 'package.json');
  if (!existsSync(manifest)) {
    return undefined;
  }
  const content: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  const name = fieldOf(content, 'name');
  const version = fieldOf(content, 'version');
  const range = fieldOf(fieldOf(content, 'peerDependencies'), 'eslint');
  return typeof name === 'string'
    ? {
        name,
        version: typeof version === 'string' ? version : 'unknown',
        eslintRange: typeof range === 'string' ? range : '',
      }
    : undefined;
}

function ancestors(directory: string): string[] {
  const { root } = path.parse(directory);
  const segments = path
    .relative(root, directory)
    .split(path.sep)
    .filter((part) => part !== '');
  return [
    ...segments.map((_part, index) =>
      path.join(root, ...segments.slice(0, segments.length - index)),
    ),
    root,
  ];
}

function packageAbove(directory: string): PackageInfo | undefined {
  for (const folder of ancestors(directory)) {
    const found = manifestAt(folder);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function framePackages(text: string, cwd: string): PackageInfo[] {
  const files = [...text.matchAll(FRAME_PATH)].map(([, found = '']) =>
    path.resolve(cwd, found.startsWith('file://') ? fileURLToPath(found) : found),
  );
  return [...new Set(files)].flatMap((file) => packageAbove(path.dirname(file)) ?? []);
}

export function incompatiblePackageMessage(
  text: string,
  { cwd, major = runningMajor() }: { readonly cwd: string; readonly major?: number },
): string | undefined {
  const found = framePackages(text, cwd).find(
    ({ eslintRange }) => eslintRange !== '' && !rangeAcceptsMajor(eslintRange, major),
  );
  return found === undefined
    ? undefined
    : withTroubleshooting(
        `${found.name} ${found.version} ${INCOMPATIBLE_MARKER} ${String(major)} ` +
          `(it supports eslint ${found.eslintRange}). Update it, or the package that depends on it, ` +
          `to a version that supports ESLint ${String(major)}.`,
        TROUBLESHOOTING_ANCHORS.incompatibleEslintPackage,
      );
}
