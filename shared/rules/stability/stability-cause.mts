import { folderOf, remembered, setMap } from './graph-maps.mts';
import { byText } from '../../text-order/by-text.mts';
import type { Cause, CauseContext, CauseUnit, Level, StabilityEdge } from './stability-types.mts';

type Entry = [string, number];

type Adjacency = ReadonlyMap<string, ReadonlySet<string>>;

type LevelIndex = {
  readonly summary: (key: string) => CauseUnit;
  readonly neighbours: (key: string) => Map<string, number>;
  readonly folders: (key: string) => string[];
  readonly heaviestAround: (key: string) => string[];
};

const SAMPLED_FILES = 3;
const LISTED_FOLDERS = 10;
const LISTED_UNITS = 10;

function adjacencyOf(edges: readonly StabilityEdge[]): Map<string, Set<string>> {
  return setMap(
    edges.flatMap(({ source, target }): [string, string][] => [
      [source, target],
      [target, source],
    ]),
  );
}

function membersBy(
  modules: readonly string[],
  keyOf: (module: string) => string,
): Map<string, Set<string>> {
  return setMap(modules.map((module): [string, string] => [keyOf(module), module]));
}

function foldersOf(members: Iterable<string>, fileOf: (module: string) => string): string[] {
  return [...new Set([...members].map((module) => folderOf(fileOf(module))))].sort(byText);
}

function unitSummary(
  members: Iterable<string>,
  { label, fileOf }: { readonly label: string; readonly fileOf: (module: string) => string },
): CauseUnit {
  const files = [...members].map(fileOf).sort(byText);
  return {
    unit: label,
    folders: foldersOf(members, fileOf).slice(0, LISTED_FOLDERS),
    files: files.slice(0, SAMPLED_FILES),
    count: files.length,
  };
}

function levelIndex(
  level: Level,
  { context, adjacency }: { readonly context: CauseContext; readonly adjacency: Adjacency },
): LevelIndex {
  const keyOf = level === 'package' ? context.group : context.unitOf;
  const members = membersBy(context.modules, keyOf);
  const summary = remembered((key: string) => {
    const group = members.get(key) ?? new Set<string>();
    const [first = ''] = group;
    return unitSummary(group, { label: context.labelOf(level, first), fileOf: context.fileOf });
  });
  const neighbours = remembered((key: string) => {
    const found = new Map<string, number>();
    for (const module of members.get(key) ?? []) {
      for (const other of adjacency.get(module) ?? []) {
        const unit = keyOf(other);
        found.set(unit, (found.get(unit) ?? 0) + 1);
      }
    }
    found.delete(key);
    return found;
  });
  const folders = remembered((key: string) =>
    foldersOf(members.get(key) ?? new Set<string>(), context.fileOf),
  );
  const heaviestAround = remembered((key: string) =>
    heaviest(neighbours(key)).map(([unit]) => unit),
  );
  return { summary, neighbours, folders, heaviestAround };
}

function isHeavier([leftKey, left]: Entry, [rightKey, right]: Entry): boolean {
  return left > right || (left === right && leftKey < rightKey);
}

function heaviest(around: Iterable<Entry>): Entry[] {
  const top: Entry[] = [];
  for (const entry of around) {
    const last = top.at(-1);
    if (last === undefined || top.length < LISTED_UNITS || isHeavier(entry, last)) {
      const index = top.findIndex((listed) => isHeavier(entry, listed));
      top.splice(index < 0 ? top.length : index, 0, entry);
      top.length = Math.min(top.length, LISTED_UNITS);
    }
  }
  return top;
}

function listedUnits(
  { source, target }: { readonly source: string; readonly target: string },
  index: LevelIndex,
): CauseUnit[] {
  const fromSource = index.neighbours(source);
  const fromTarget = index.neighbours(target);
  const candidates = new Set([
    target,
    ...index.heaviestAround(source),
    ...index.heaviestAround(target),
  ]);
  candidates.delete(source);
  const entries = [...candidates].map((key): Entry => [
    key,
    key === target ? Infinity : (fromSource.get(key) ?? 0) + (fromTarget.get(key) ?? 0),
  ]);
  return heaviest(entries)
    .map(([key]) => index.summary(key))
    .sort((left, right) => left.unit.localeCompare(right.unit));
}

export function causeIndex(
  context: CauseContext,
  edges: readonly StabilityEdge[],
): (pair: { readonly level: Level; readonly source: string; readonly target: string }) => Cause {
  const adjacency = adjacencyOf(edges);
  const levels = {
    package: levelIndex('package', { context, adjacency }),
    unit: levelIndex('unit', { context, adjacency }),
  };
  return ({ level, source, target }) => {
    const index = levels[level];
    return { folders: index.folders(source), units: listedUnits({ source, target }, index) };
  };
}
