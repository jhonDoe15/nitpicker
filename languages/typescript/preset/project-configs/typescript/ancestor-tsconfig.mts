import { existsSync } from 'node:fs';
import path from 'node:path';
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
  const parent = path.dirname(directory);
  if (parent === directory) {
    return [];
  }
  if (existsSync(path.join(parent, '.git'))) {
    return [parent];
  }
  const above = ancestorsUpToRepository(parent);
  return above.length === 0 ? [] : [parent, ...above];
}

function coversDirectory(config: unknown, relativeDirectory: string): boolean {
  if (isSolutionTsconfig(config)) {
    return false;
  }
  const include = fieldOf(config, 'include');
  const files = listOf(fieldOf(config, 'files'));
  const specs =
    include === undefined ? (files.length === 0 ? ['**/*'] : []) : listOf(include).map(textOf);
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
  const [head, ...rest] = spec;
  const [name, ...below] = target;
  if (head === undefined || name === undefined || head === '**') {
    return true;
  }
  return segmentPattern(head).test(name) && specReaches(rest, below);
}

function specContains(spec: readonly string[], target: readonly string[]): boolean {
  const [head, ...rest] = spec;
  const [name, ...below] = target;
  if (head === undefined) {
    return true;
  }
  if (head === '**') {
    return (
      rest.length === 0 ||
      specContains(rest, target) ||
      (name !== undefined && specContains(spec, below))
    );
  }
  return name !== undefined && segmentPattern(head).test(name) && specContains(rest, below);
}

function segmentPattern(segment: string): RegExp {
  const escaped = segment.replaceAll(/[.+^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`, 'u');
}
