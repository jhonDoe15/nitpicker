import { existsSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../../../shared/filesystem.mts';
import { escapeRegExp } from '../../../../../shared/paths/glob.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { PROJECT_TSCONFIG, isSolutionTsconfig, readJsonc } from '../../modules/tsconfig-files.mts';

export type AncestorTsconfig = {
  readonly extended: string;
  readonly hasFiles: boolean;
};

export function coveringAncestorTsconfig(projectDirectory: string): AncestorTsconfig | undefined {
  const directory = path.resolve(projectDirectory);
  if (existsSync(path.join(directory, '.git'))) {
    return undefined;
  }
  for (const ancestor of ancestorsUpToRepository(directory)) {
    const file = path.join(ancestor, PROJECT_TSCONFIG);
    const config = existsSync(file) ? readJsonc(file) : undefined;
    if (config !== undefined && coversDirectory(config, path.relative(ancestor, directory))) {
      return {
        extended: path.relative(directory, file).split(path.sep).join('/'),
        hasFiles: fieldOf(config, 'files') !== undefined,
      };
    }
  }
  return undefined;
}

function ancestorsUpToRepository(directory: string): string[] {
  const parents = ancestorDirectories(directory).slice(1);
  const repository = parents.findIndex((parent) => existsSync(path.join(parent, '.git')));
  return repository === -1 ? [] : parents.slice(0, repository + 1);
}

function includedSpecs(include: unknown, files: readonly unknown[]): string[] {
  if (include !== undefined) {
    return listOf(include).map(textOf);
  }
  return files.length === 0 ? ['**/*'] : [];
}

function coversDirectory(config: unknown, relativeDirectory: string): boolean {
  if (isSolutionTsconfig(config)) {
    return false;
  }
  const specs = includedSpecs(fieldOf(config, 'include'), listOf(fieldOf(config, 'files')));
  const target = relativeDirectory.split(path.sep);
  const excluded = listOf(fieldOf(config, 'exclude')).map(textOf);
  return (
    specs.some((spec) => specReaches(specSegments(spec), target)) &&
    !excluded.some((spec) => specContains(specSegments(spec), target))
  );
}

function specSegments(spec: string): string[] {
  return spec.split('/').filter((segment) => segment !== '' && segment !== '.');
}

function specReaches(spec: readonly string[], target: readonly string[]): boolean {
  for (const [index, head] of spec.entries()) {
    const name = target[index];
    if (name === undefined || head === '**') {
      return true;
    }
    if (!segmentPattern(head).test(name)) {
      return false;
    }
  }
  return true;
}

function specContains(spec: readonly string[], target: readonly string[]): boolean {
  const pending: (readonly [number, number])[] = [[0, 0]];
  const seen = new Set<string>();
  for (const [at, from] of pending) {
    const head = spec[at];
    const name = target[from];
    if (head === undefined || (head === '**' && at === spec.length - 1)) {
      return true;
    }
    const next: (readonly [number, number])[] =
      head === '**'
        ? [[at + 1, from], ...(name === undefined ? [] : [[at, from + 1] as const])]
        : [];
    if (head !== '**' && name !== undefined && segmentPattern(head).test(name)) {
      next.push([at + 1, from + 1]);
    }
    for (const state of next.filter((candidate) => !seen.has(candidate.join(':')))) {
      seen.add(state.join(':'));
      pending.push(state);
    }
  }
  return false;
}

const WILDCARDS: ReadonlyMap<string, string> = new Map([
  ['*', '.*'],
  ['?', '.'],
]);

function segmentPattern(segment: string): RegExp {
  const pattern = new RegExp(
    segment
      .split(/([*?])/u)
      .map((part) => WILDCARDS.get(part) ?? escapeRegExp(part))
      .join(''),
    'u',
  );
  return new RegExp(`^(?:${pattern.source})$`, 'u');
}
