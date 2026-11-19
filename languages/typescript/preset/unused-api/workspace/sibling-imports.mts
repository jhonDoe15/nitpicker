import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { PackageEntry } from './workspace-types.mts';

type Scanned = {
  readonly imports: readonly string[];
  readonly reexports: boolean;
};
type Scans = Readonly<Record<string, Scanned>>;
type Lookup = (absolute: string) => string | undefined;
type Resolution = {
  readonly owner: Lookup;
  readonly byName: (specifier: string) => string | undefined;
  readonly aliases: readonly (readonly [string, readonly string[]])[];
  readonly baseUrl: string | undefined;
};

export type SiblingRequest = {
  readonly projectRoot: string;
  readonly files: readonly string[];
  readonly packages: readonly PackageEntry[];
  readonly options: TypeScript.CompilerOptions;
};

const ts = typescriptApi();
const REEXPORTING = /\bexport\s*(?:\*|\{|=|default\s+[\w$.]+\s*(?:;|$))/mu;
const TEMPLATE_LOAD = /\b(?:import|require)\s*\(\s*`([^`$]*)/gu;
const WILDCARD = '*';
const MISSING_FILE = 'ENOENT';

function textOf(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (fieldOf(error, 'code') === MISSING_FILE) {
      return undefined;
    }
    throw error;
  }
}

function scanned(text: string): Scanned {
  const { importedFiles } = ts.preProcessFile(text, true, true);
  const templates = [...text.matchAll(TEMPLATE_LOAD)].map(([, prefix]) => prefix ?? '');
  return {
    imports: [...importedFiles.map(({ fileName }) => fileName), ...templates],
    reexports: REEXPORTING.test(text),
  };
}

function scansOf(files: readonly string[]): Scans {
  return Object.fromEntries(
    files.flatMap((file) => {
      const text = textOf(file);
      return text === undefined ? [] : [[file, scanned(text)]];
    }),
  );
}

function ownerLookup(directories: readonly string[]): Lookup {
  const longestFirst = [...new Set(directories)].toSorted(
    (left, right) => right.length - left.length,
  );
  return (absolute) =>
    longestFirst.find(
      (directory) => absolute === directory || absolute.startsWith(`${directory}${path.sep}`),
    );
}

function nameLookup(packages: readonly PackageEntry[]): (specifier: string) => string | undefined {
  const longestFirst = packages.toSorted((left, right) => right.name.length - left.name.length);
  return (specifier) =>
    longestFirst.find(({ name }) => specifier === name || specifier.startsWith(`${name}/`))?.dir;
}

function aliasTargets({ aliases }: Resolution, specifier: string): readonly string[] | undefined {
  for (const [pattern, targets] of aliases) {
    const [prefix = '', suffix = ''] = pattern.split(WILDCARD);
    const wildcard = pattern.includes(WILDCARD);
    const matches = wildcard
      ? specifier.startsWith(prefix) && specifier.endsWith(suffix)
      : specifier === pattern;
    if (matches) {
      const middle = specifier.slice(prefix.length, specifier.length - suffix.length);
      return targets.map((target) => target.replace(WILDCARD, middle));
    }
  }
  return undefined;
}

function targetsOf(resolution: Resolution, file: string, specifier: string): readonly string[] {
  const { owner, byName, baseUrl } = resolution;
  if (specifier.startsWith('.')) {
    return [owner(path.resolve(path.dirname(file), specifier))].filter((dir) => dir !== undefined);
  }
  const named = byName(specifier);
  if (named !== undefined) {
    return [named];
  }
  const aliased = aliasTargets(resolution, specifier);
  const candidates = aliased ?? (baseUrl === undefined ? [] : [path.resolve(baseUrl, specifier)]);
  return candidates.map((candidate) => owner(candidate)).filter((dir) => dir !== undefined);
}

function stringOption(options: TypeScript.CompilerOptions, name: string): string | undefined {
  const value: unknown = Reflect.get(options, name);
  return typeof value === 'string' ? value : undefined;
}

function resolutionOf({ projectRoot, packages, options }: SiblingRequest): Resolution {
  const base = stringOption(options, 'pathsBasePath') ?? projectRoot;
  return {
    owner: ownerLookup([projectRoot, ...packages.map(({ dir }) => dir)]),
    byName: nameLookup(packages),
    aliases: Object.entries(options.paths ?? {}).map(([pattern, targets]) => [
      pattern,
      targets.map((target) => path.resolve(base, target)),
    ]),
    baseUrl: stringOption(options, 'baseUrl'),
  };
}

function isWithin(directory: string, root: string): boolean {
  return directory === root || directory.startsWith(`${root}${path.sep}`);
}

type Reach = {
  readonly reexporting: readonly string[];
  readonly owner: (file: string) => string | undefined;
  readonly reaches: (file: string) => boolean;
  readonly reached: Set<string>;
};

function newlyReached({ reexporting, owner, reaches, reached }: Reach): string[] {
  return reexporting.flatMap((file) => {
    const found = owner(file);
    return found !== undefined && !reached.has(found) && reaches(file) ? [found] : [];
  });
}

function growReach(reach: Reach): void {
  const pending = newlyReached(reach);
  for (const dir of pending) {
    reach.reached.add(dir);
    for (const found of newlyReached(reach).filter((owner) => !pending.includes(owner))) {
      pending.push(found);
    }
  }
}

export function relevantSiblingFiles(request: SiblingRequest): string[] {
  const { projectRoot, files, packages } = request;
  const resolution = resolutionOf(request);
  const scans = scansOf(files);
  const imported = new Map(
    files.map((file) => [
      file,
      new Set(
        (scans[file]?.imports ?? []).flatMap((specifier) => targetsOf(resolution, file, specifier)),
      ),
    ]),
  );
  const reached = new Set(
    [projectRoot, ...packages.map(({ dir }) => dir)].filter((dir) => isWithin(dir, projectRoot)),
  );
  function reaches(file: string): boolean {
    return [...(imported.get(file) ?? [])].some((dir) => reached.has(dir));
  }
  growReach({
    reexporting: files.filter((candidate) => scans[candidate]?.reexports === true),
    owner: resolution.owner,
    reaches,
    reached,
  });
  return files.filter((file) => reaches(file));
}
