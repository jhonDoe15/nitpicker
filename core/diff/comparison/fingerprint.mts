import { createHash } from 'node:crypto';
import type { ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import { normalizeGitPath } from '../git/normalize.mts';
import { remapRootPrefix } from '../git/patches/renames.mts';
import {
  agreedPairs,
  bareFileMoves,
  packageMoves,
  qualifiedNameMoves,
  remapBareNames,
  remapQualifiedNames,
} from './moved-names/qualified-names.mts';
import { NO_DECLARED } from './moved-names/declared/no-declared-moves.mts';
import { headPlacesOf, movedFolder, remapModuleSuffix } from './moved-names/module-paths.mts';
import { canonicalSpecifiers, stemMoves } from './moved-names/relative-specifiers.mts';
import type { BaseMoves, MoveFields, Moves } from './moved-names/declared/move-types.mts';
import type { TrackedFinding } from './model/finding-types.mts';

const NO_MOVES = baseMoves(new Map());

type Canonical = { readonly path: string | undefined; readonly identity: string };

type NameContext = {
  readonly moves: BaseMoves;
  readonly packages: ReadonlyMap<string, string>;
  readonly own: readonly [string, string] | undefined;
};

export function baseMoves(
  baseToHeadRenames: Moves,
  {
    baseToHeadDirectories: directories = new Map<string, string>(),
    baseToHeadPackages: packages = new Map<string, string>(),
    baseToHeadDeclared: declared = NO_DECLARED,
    headFindings = [],
  }: MoveFields & {
    readonly headFindings?: readonly { readonly path: string; readonly identity: string }[];
  } = {},
): BaseMoves {
  const bare = new Map([
    ...bareFileMoves(baseToHeadRenames, {
      skip: declared.covered,
      packageDirs: declared.packageDirs,
    }),
    ...declared.bare,
  ]);
  return {
    files: baseToHeadRenames,
    longestFirst: [...baseToHeadRenames].sort(
      ([leftPath], [rightPath]) => rightPath.length - leftPath.length,
    ),
    directories,
    names: new Map([
      ...qualifiedNameMoves(baseToHeadRenames, { skip: declared.covered }),
      ...declared.names,
    ]),
    bare,
    bareNames: agreedPairs([...bare.values()]),
    declared,
    headPlaces: headPlacesOf(headFindings),
    stems: stemMoves(baseToHeadRenames),
    packageNames: packages,
  };
}

export function comparisonKey(
  finding: Pick<
    TrackedFinding,
    'path' | 'identity' | 'tool' | 'rule' | 'classification' | 'symbol' | 'metric'
  >,
  moves: BaseMoves = NO_MOVES,
): string {
  const normalizedPath = normalizeGitPath(finding.path);
  const movedPath = moves.files.get(normalizedPath) ?? movedFolder(normalizedPath, moves);
  const packages = packagesOf(normalizedPath, movedPath, moves);
  const cycle = parseCycleIdentity(finding.identity);
  const packageIdentity = remapPackageIdentity(finding, moves.packageNames);
  const canonical =
    cycle === undefined
      ? sortedPair({
          path: packageIdentity?.path ?? movedPath ?? normalizedPath,
          identity: canonicalSpecifiers(
            remapNames(
              remapRootPrefix(
                remapIdentityPaths(
                  remapModuleSuffix(packageIdentity?.identity ?? finding.identity, moves),
                  moves,
                ),
                moves.directories,
              ),
              { moves, packages, own: moves.bare.get(normalizedPath) },
            ),
            normalizedPath,
            { stems: moves.stems, newFilePath: movedPath },
          ),
        })
      : remapCycle(cycle, moves);
  const symbol = remapNames(remapIdentityPaths(finding.symbol ?? '', moves), {
    moves,
    packages,
    own: moves.bare.get(normalizedPath),
  });
  return JSON.stringify([
    finding.tool,
    finding.rule,
    canonical.path,
    symbol,
    canonical.identity,
    finding.classification,
    finding.metric?.name ?? '',
  ]);
}

function packagesOf(
  normalizedPath: string,
  movedPath: string | undefined,
  moves: BaseMoves,
): Map<string, string> {
  return moves.declared.covered.has(normalizedPath)
    ? (moves.declared.filePackages.get(normalizedPath) ?? new Map<string, string>())
    : packageMoves(normalizedPath, movedPath);
}

function remapNames(text: string, { moves, packages, own }: NameContext): string {
  const dotted = remapQualifiedNames(text, moves.names, packages);
  return dotted === text && own !== undefined ? remapBareNames(text, new Map([own])) : dotted;
}

const PACKAGE_EDGE = /^package-edge:(.+)->(.+)$/u;
const PACKAGE_METRIC = /^package:(.+):([^:]+)$/u;

function remapPackageIdentity(
  { identity, path: findingPath }: { readonly identity: string; readonly path: string },
  packageNames: Moves,
): { readonly identity: string; readonly path?: string | undefined } | undefined {
  if (packageNames.size === 0 || typeof identity !== 'string') {
    return undefined;
  }
  const edge = PACKAGE_EDGE.exec(identity);
  if (edge !== null) {
    const [, source = '', target = ''] = edge;
    return {
      identity: `package-edge:${packageNames.get(source) ?? source}->${packageNames.get(target) ?? target}`,
      path: findingPath === source ? packageNames.get(source) : undefined,
    };
  }
  const metric = PACKAGE_METRIC.exec(identity);
  const moved = packageNames.get(metric?.[1] ?? '');
  return moved === undefined ? undefined : { identity: `package:${moved}:${String(metric?.[2])}` };
}

const PAIR_IDENTITY = /^((?:[\w-]+:)*pair:)([^|]+)\|([^:]+)(:.*)?$/u;

function sortedPair(canonical: Canonical): Canonical {
  const match = PAIR_IDENTITY.exec(canonical.identity);
  const [, prefix = '', first = '', second = '', suffix = ''] = match ?? [];
  if (match === null || first.localeCompare(second) <= 0) {
    return canonical;
  }
  return {
    path: canonical.path === first ? second : canonical.path,
    identity: `${prefix}${second}|${first}${suffix}`,
  };
}

function parseCycleIdentity(
  identity: string,
): { readonly members: string[]; readonly suffix: string } | undefined {
  const match = /^cycle:([^|]+)(\|.*)?$/.exec(identity);
  return match === null
    ? undefined
    : { members: (match[1] ?? '').split('>'), suffix: match.at(2) ?? '' };
}

function remapCycle(
  { members, suffix }: { readonly members: readonly string[]; readonly suffix: string },
  moves: BaseMoves,
): Canonical {
  const remapped = members.map(
    (member) =>
      moves.files.get(member) ??
      moves.packageNames.get(member) ??
      moves.bareNames.get(member) ??
      remapQualifiedNames(member, moves.names),
  );
  const rotations = remapped.map((_, index) => [
    ...remapped.slice(index),
    ...remapped.slice(0, index),
  ]);
  const canonicalMembers = rotations.reduce<readonly string[]>(
    (best, rotation) => (rotation.join('\0').localeCompare(best.join('\0')) < 0 ? rotation : best),
    rotations[0] ?? [],
  );
  return {
    path: canonicalMembers[0] ?? '',
    identity: `cycle:${canonicalMembers.join('>')}${suffix}`,
  };
}

function remapIdentityPaths(identity: string, moves: BaseMoves): string {
  let remappedIdentity = identity;
  for (const [oldPath, newPath] of moves.longestFirst) {
    remappedIdentity = remappedIdentity.replaceAll(oldPath, () => newPath);
  }
  return remappedIdentity;
}

export function canonicalCycleIdentity(edges: unknown): string {
  if (!Array.isArray(edges) || edges.length === 0) {
    throw new TypeError('A cycle identity requires at least one directed edge');
  }

  const canonicalEdges = edges.map((edge: unknown, index: number) => {
    const source = fieldOf(edge, 'source');
    const target = fieldOf(edge, 'target');
    if (typeof source !== 'string' || typeof target !== 'string') {
      throw new TypeError(`Cycle edge ${String(index)} must contain source and target paths`);
    }
    return `${normalizeGitPath(source)}\0${normalizeGitPath(target)}`;
  });
  canonicalEdges.sort();
  return createHash('sha256').update(canonicalEdges.join('\n')).digest('hex');
}

export function entryKey(entry: ReportEntry): string {
  const symbol = fieldOf(entry, 'symbol');
  const metricName = fieldOf(fieldOf(entry, 'metric'), 'name');
  return comparisonKey({
    path: textOf(entry.path),
    identity: textOf(fieldOf(entry, 'identity')),
    tool: textOf(entry.tool),
    rule: textOf(entry.rule),
    classification: textOf(entry.classification),
    ...(typeof symbol === 'string' ? { symbol } : {}),
    ...(typeof metricName === 'string' ? { metric: { name: metricName, value: 0 } } : {}),
  });
}
