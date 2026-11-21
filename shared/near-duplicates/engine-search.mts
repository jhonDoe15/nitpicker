import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../engine/engine-binary.mts';
import { readEngineLinesSync } from '../engine/engine-rows.mts';
import { runEngineSync } from '../engine/engine-run.mts';
import { canonicalTree } from './canonical/canonical.mts';
import { logicPairs } from './proof/candidates.mts';
import { matchMasks } from './search/tokens.mts';
import { compareText } from './tree/keys.mts';
import { present } from './tree/nodes.mts';
import type { NearUnit, PreparedUnit, TreeNode } from './tree/tree-types.mts';

type Environment = Readonly<Record<string, string | undefined>>;
type Pair = [PreparedUnit, PreparedUnit];
type Searched = {
  readonly size: number;
  readonly rewritten?: boolean;
  readonly plainKey?: string;
  readonly tree?: TreeNode;
};
type SearchedList = { readonly members: number[]; readonly pairs: [number, number][] };

type OutputLine = Searched & Partial<SearchedList>;

const parseLine: (text: string) => OutputLine = JSON.parse;

export type SearchedSets = {
  readonly originals: PreparedUnit[];
  readonly mixed: PreparedUnit[];
  readonly variants: Map<string, PreparedUnit>;
  readonly originalPairs: Pair[];
  readonly mixedPairs: Pair[];
};

const SWITCH = 'NITPICKER_NEAR_DUPLICATE_ENGINE';
const TIME_LIMIT_MS = 30 * 60 * 1000;
const NO_MASKS = matchMasks([]);

function unavailable(environment: Environment, reason: string): undefined {
  if (environment[SWITCH] === 'required') {
    throw new Error(`${SWITCH}=required, but ${reason}`);
  }
  return undefined;
}

function rejected(environment: Environment, reason: string, trees: readonly TreeNode[]) {
  if (environment[SWITCH] === 'required') {
    for (const tree of trees) {
      canonicalTree(tree);
    }
  }
  return unavailable(environment, reason);
}

function preparedOf(unit: NearUnit, searched: Searched | undefined): PreparedUnit | undefined {
  if (searched?.tree === undefined) {
    return undefined;
  }
  return {
    unit,
    tree: searched.tree,
    rewritten: searched.rewritten === true,
    plainKey: searched.plainKey ?? '',
    size: searched.size,
    tokens: [],
    bag: new Map(),
    masks: NO_MASKS,
  };
}

function pairsOf(list: readonly PreparedUnit[], found: readonly [number, number][]): Pair[] {
  const count = list.length;
  const keys = new Set([
    ...found.map(([first, second]) => first * count + second),
    ...logicPairs(list, () => true),
  ]);
  return [...keys]
    .sort((left, right) => left - right)
    .map((key) => [present(list[Math.floor(key / count)]), present(list[key % count])]);
}

function writeLines(file: string, values: readonly unknown[]): void {
  const descriptor = openSync(file, 'w');
  try {
    for (const value of values) {
      writeSync(descriptor, `${JSON.stringify(value)}\n`);
    }
  } finally {
    closeSync(descriptor);
  }
}

function runSearch(
  units: readonly NearUnit[],
  header: unknown,
  { binary, environment }: { readonly binary: string; readonly environment: Environment },
) {
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-near-'));
  try {
    const input = path.join(folder, 'units.jsonl');
    const out = path.join(folder, 'out.jsonl');
    try {
      writeLines(input, [header, ...units.map(({ tree }) => tree)]);
    } catch (error) {
      return unavailable(environment, `its input could not be written: ${String(error)}`);
    }
    const { status, stderr } = runEngineSync(
      ['near-duplicate-search', '--in', input, '--out', out],
      {
        binary,
        timeoutMs: TIME_LIMIT_MS,
      },
    );
    if (status !== 0) {
      const reason = `near-duplicate-search ended with ${String(status)}: ${stderr}`;
      return rejected(
        environment,
        reason,
        units.map(({ tree }) => tree),
      );
    }
    return [...readEngineLinesSync(out, parseLine)];
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function searchedSets(
  sorted: readonly NearUnit[],
  trees: ReadonlyMap<string, TreeNode>,
  environment: Environment = process.env,
): SearchedSets | undefined {
  const binary = environment[SWITCH] === 'off' ? undefined : findEngine(environment);
  if (binary === undefined || new Set(sorted.map(({ id }) => id)).size !== sorted.length) {
    return environment[SWITCH] === 'off' ? undefined : unavailable(environment, 'it cannot run');
  }
  const varied = sorted.flatMap((unit) => {
    const tree = trees.get(unit.id);
    return tree === undefined ? [] : [{ ...unit, tree }];
  });
  const variantAt = new Map(varied.map((unit, index) => [unit.id, sorted.length + index]));
  const choices = sorted.map((unit, index) => [variantAt.get(unit.id) ?? index, index]);
  const header = { lists: [sorted.map((_, index) => [index]), choices] };
  const all = [...sorted, ...varied];
  const lines = runSearch(all, header, { binary, environment });
  if (lines === undefined) {
    return undefined;
  }
  const prepared = all.map((unit, index) => preparedOf(unit, lines[index]));
  const [originalList, mixedList] = lines
    .slice(all.length)
    .map(({ members = [], pairs = [] }) => ({ members, pairs }));
  const listOf = (found: SearchedList) => found.members.map((index) => present(prepared[index]));
  const originals = listOf(present(originalList));
  const mixed = listOf(present(mixedList));
  const variants = new Map(
    varied.flatMap((unit, index) => {
      const variant = prepared[sorted.length + index];
      return variant === undefined ? [] : [[unit.id, variant] as const];
    }),
  );
  return {
    originals,
    mixed,
    variants,
    originalPairs: pairsOf(originals, present(originalList).pairs),
    mixedPairs: variants.size === 0 ? [] : pairsOf(mixed, present(mixedList).pairs),
  };
}

export function sortedUnits(units: readonly NearUnit[]): NearUnit[] {
  return units.toSorted((left, right) => compareText(left.id, right.id));
}
