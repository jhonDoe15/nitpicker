import type TypeScript from 'typescript';
import { isProjectSource } from '../program-rules/project-source-files.mts';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';
import { isReference, ts } from '../typed/typescript-views.mts';
import { flagOf } from './flags.mts';
import { iterationsIn, type Iteration } from './iterations.mts';
import {
  calleeNameOf,
  descendantsOf,
  namesOfOwners,
  receivesIncludingDeleted,
  recordCallSites,
  type CallSites,
  type ParameterSlot,
  type Scan,
} from './including-deleted.mts';

type Entry = {
  readonly name: string;
  alias: string | undefined;
  total: number;
  guarded: number;
  readonly helpers: Map<string, number>;
};
export type Followed = {
  readonly name: string;
  readonly alias: string | undefined;
  readonly helper: string | undefined;
  readonly share: number;
};

const MIN_ITERATIONS = 5;
const MIN_SHARE = 0.8;
const TEST_PATH =
  /(?:^|\/)(?:test|tests|__tests__|__mocks__|test-support|e2e|fixtures|__fixtures__)\/|\.(?:test|spec)\.[^/]+$/u;
const fileIterations = new WeakMap<TypeScript.SourceFile, Iteration[]>();
type Index = { readonly entries: Map<string, Entry>; readonly intended: WeakSet<TypeScript.Node> };
const indexes = new WeakMap<TypeScript.Program, Index>();

export function iterationsOf(
  sourceFile: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
): Iteration[] {
  return cachedValue(fileIterations, sourceFile, () => iterationsIn(sourceFile, checker));
}

function narrowedHelper(
  call: TypeScript.CallExpression,
  checker: TypeScript.TypeChecker,
): { readonly key: string; readonly name: string } | undefined {
  const type = checker.getTypeAtLocation(call);
  if (!(checker.isArrayType(type) && isReference(type))) {
    return undefined;
  }
  const [element] = checker.getTypeArguments(type);
  const flag = element === undefined ? undefined : flagOf(checker, element, call);
  const name = calleeNameOf(call);
  return flag?.narrowed && name !== undefined ? { key: flag.key, name } : undefined;
}

function recordHelpers(
  sourceFile: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  entries: Map<string, Entry>,
): void {
  for (const node of descendantsOf(sourceFile)) {
    const helper = ts.isCallExpression(node) ? narrowedHelper(node, checker) : undefined;
    if (helper !== undefined) {
      const counts = entries.get(helper.key)?.helpers;
      counts?.set(helper.name, (counts.get(helper.name) ?? 0) + 1);
    }
  }
}

function callSitesOf(
  checker: TypeScript.TypeChecker,
  files: readonly TypeScript.SourceFile[],
  slots: readonly ParameterSlot[],
): CallSites {
  const scan: Scan = { checker, names: namesOfOwners(slots), sites: new Map() };
  if (scan.names.size > 0) {
    for (const file of files) {
      recordCallSites(scan, file);
    }
  }
  return scan.sites;
}

function intendedIterations(
  checker: TypeScript.TypeChecker,
  files: readonly TypeScript.SourceFile[],
): WeakSet<TypeScript.Node> {
  const all = files.flatMap((file) => iterationsOf(file, checker));
  const slots = all.flatMap((each) => (each.slot === undefined ? [] : [each.slot]));
  const sites = callSitesOf(checker, files, slots);
  const intended = new WeakSet<TypeScript.Node>();
  for (const each of all) {
    const passed = each.slot !== undefined && receivesIncludingDeleted(each.slot, sites);
    if (each.includesDeleted || passed) {
      intended.add(each.node);
    }
  }
  return intended;
}

function tally(entries: Map<string, Entry>, iteration: Iteration): void {
  const { flag, guarded } = iteration;
  const entry: Entry = entries.get(flag.key) ?? {
    name: flag.name,
    alias: undefined,
    total: 0,
    guarded: 0,
    helpers: new Map(),
  };
  entry.total += 1;
  entry.guarded += guarded ? 1 : 0;
  entry.alias ??= flag.narrowed ? flag.alias : undefined;
  entries.set(flag.key, entry);
}

function buildIndex(program: TypeScript.Program): Index {
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter((file) => isProjectSource(file, TEST_PATH));
  const entries = new Map<string, Entry>();
  const intended = intendedIterations(checker, files);
  for (const iteration of files.flatMap((file) => iterationsOf(file, checker))) {
    if (!intended.has(iteration.node)) {
      tally(entries, iteration);
    }
  }
  for (const file of files) {
    recordHelpers(file, checker, entries);
  }
  return { entries, intended };
}

export function isIntended(program: TypeScript.Program, node: TypeScript.Node): boolean {
  return cachedValue(indexes, program, buildIndex).intended.has(node);
}

export function followedFlag(program: TypeScript.Program, key: string): Followed | undefined {
  const entry = cachedValue(indexes, program, buildIndex).entries.get(key);
  const follows =
    entry !== undefined &&
    entry.total >= MIN_ITERATIONS &&
    entry.guarded / entry.total >= MIN_SHARE;
  if (!follows) {
    return undefined;
  }
  const best = [...entry.helpers].reduce<[string, number] | undefined>(
    (top, each) => (top === undefined || each[1] > top[1] ? each : top),
    undefined,
  );
  const helper = best?.[0];
  return {
    name: entry.name,
    alias: entry.alias,
    helper,
    share: Math.round((entry.guarded / entry.total) * 100),
  };
}
