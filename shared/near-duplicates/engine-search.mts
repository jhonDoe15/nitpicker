import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../engine/engine-binary.mts';
import { engineEnvironment } from '../engine/engine-environment.config.mts';
import { readEngineLinesSync } from '../engine/engine-rows.mts';
import { runEngineSync } from '../engine/engine-run.mts';
import type { Environment } from '../processes/environment.mts';
import { canonicalTree } from './canonical/canonical.mts';
import { logicPairs } from './proof/candidates.mts';
import { inlinedTrees } from './proof/inline.mts';
import { matchMasks } from './search/tokens.mts';
import { compareText } from './tree/keys.mts';
import { present } from './tree/nodes.mts';
import type { NearUnit, PreparedUnit, TreeNode } from './tree/tree-types.mts';

type Pair = [PreparedUnit, PreparedUnit];
type Searched = {
  readonly size: number;
  readonly rewritten?: unknown;
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

function checkOptional(environment: Environment, reason: string): void {
  if (environment[SWITCH] === 'required') {
    throw new Error(`${SWITCH}=required, but ${reason}`);
  }
}

function checkTreesOptional(
  environment: Environment,
  reason: string,
  trees: readonly TreeNode[],
): void {
  if (environment[SWITCH] === 'required') {
    for (const tree of trees) {
      canonicalTree(tree);
    }
  }
  checkOptional(environment, reason);
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
): OutputLine[] | undefined {
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-near-'));
  try {
    const input = path.join(folder, 'units.jsonl');
    const out = path.join(folder, 'out.jsonl');
    try {
      writeLines(input, [header, ...units.map(({ tree }) => tree)]);
    } catch (error) {
      checkOptional(environment, `its input could not be written: ${String(error)}`);
      return undefined;
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
      checkTreesOptional(
        environment,
        reason,
        units.map(({ tree }) => tree),
      );
      return undefined;
    }
    return [...readEngineLinesSync(out, parseLine)];
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function engineFor(sorted: readonly NearUnit[], environment: Environment): string | undefined {
  if (environment[SWITCH] === 'off') {
    return undefined;
  }
  const binary = findEngine(environment);
  if (binary === undefined || new Set(sorted.map(({ id }) => id)).size !== sorted.length) {
    checkOptional(environment, 'it cannot run');
    return undefined;
  }
  return binary;
}

function searchHeader(sorted: readonly NearUnit[], varied: readonly NearUnit[]): unknown {
  const variantAt = new Map(varied.map((unit, index) => [unit.id, sorted.length + index]));
  const choices = sorted.map((unit, index) => [variantAt.get(unit.id) ?? index, index]);
  return { lists: [sorted.map((_, index) => [index]), choices] };
}

function listed(
  prepared: readonly (PreparedUnit | undefined)[],
  line: OutputLine | undefined,
): { readonly list: PreparedUnit[]; readonly pairs: [number, number][] } {
  const { members = [], pairs = [] } = present(line);
  return { list: members.map((index) => present(prepared[index])), pairs };
}

function setsOf(
  sorted: readonly NearUnit[],
  varied: readonly NearUnit[],
  lines: readonly OutputLine[],
): SearchedSets {
  const all = [...sorted, ...varied];
  const prepared = all.map((unit, index) => preparedOf(unit, lines[index]));
  const [originalLine, mixedLine] = lines.slice(all.length);
  const originals = listed(prepared, originalLine);
  const mixed = listed(prepared, mixedLine);
  const variants = new Map(
    varied.flatMap((unit, index) => {
      const variant = prepared[sorted.length + index];
      return variant === undefined ? [] : [[unit.id, variant] as const];
    }),
  );
  return {
    originals: originals.list,
    mixed: mixed.list,
    variants,
    originalPairs: pairsOf(originals.list, originals.pairs),
    mixedPairs: variants.size === 0 ? [] : pairsOf(mixed.list, mixed.pairs),
  };
}

export function searchedSets(
  units: readonly NearUnit[],
  environment: Environment = engineEnvironment(),
): SearchedSets | undefined {
  const sorted = sortedUnits(units);
  const trees = inlinedTrees(units);
  const binary = engineFor(sorted, environment);
  if (binary === undefined) {
    return undefined;
  }
  const varied = sorted.flatMap((unit) => {
    const tree = trees.get(unit.id);
    return tree === undefined ? [] : [{ ...unit, tree }];
  });
  const lines = runSearch([...sorted, ...varied], searchHeader(sorted, varied), {
    binary,
    environment,
  });
  return lines === undefined ? undefined : setsOf(sorted, varied, lines);
}

export function sortedUnits(units: readonly NearUnit[]): NearUnit[] {
  return units.toSorted((left, right) => compareText(left.id, right.id));
}
