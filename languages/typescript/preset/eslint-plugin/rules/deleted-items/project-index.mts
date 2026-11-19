import type TypeScript from 'typescript';
import { isProjectSource } from '../program-rules/project-source-files.mts';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';
import { isReference, ts } from '../typed/typescript-views.mts';
import { flagOf } from './flags.mts';
import { iterationsIn, type Iteration } from './iterations.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

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
const indexes = new WeakMap<TypeScript.Program, Map<string, Entry>>();

export function iterationsOf(
  sourceFile: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
): Iteration[] {
  return cachedValue(fileIterations, sourceFile, () => iterationsIn(sourceFile, checker));
}

function calleeName(call: TypeScript.CallExpression): string | undefined {
  const { expression } = call;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
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
  const name = calleeName(call);
  return flag?.narrowed && name !== undefined ? { key: flag.key, name } : undefined;
}

function recordHelpers(
  sourceFile: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  entries: Map<string, Entry>,
): void {
  const pending: TypeScript.Node[] = [sourceFile];
  for (const node of pending) {
    const helper = ts.isCallExpression(node) ? narrowedHelper(node, checker) : undefined;
    if (helper !== undefined) {
      const counts = entries.get(helper.key)?.helpers;
      counts?.set(helper.name, (counts.get(helper.name) ?? 0) + 1);
    }
    appendAll(pending, node.getChildren(sourceFile));
  }
}

function buildIndex(program: TypeScript.Program): Map<string, Entry> {
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter((file) => isProjectSource(file, TEST_PATH));
  const entries = new Map<string, Entry>();
  for (const file of files) {
    for (const { flag, guarded } of iterationsOf(file, checker)) {
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
  }
  for (const file of files) {
    recordHelpers(file, checker, entries);
  }
  return entries;
}

export function followedFlag(program: TypeScript.Program, key: string): Followed | undefined {
  const entry = cachedValue(indexes, program, buildIndex).get(key);
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
