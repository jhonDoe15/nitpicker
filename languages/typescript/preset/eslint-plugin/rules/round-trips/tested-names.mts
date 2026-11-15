import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { readLayout } from '../typed/policy-views.mts';
import { readStamped as untypedReadStamped } from '../../../modules/stamped-file-cache.mjs';
import { scriptKindOf as untypedScriptKindOf } from '../../../modules/module-sources.mjs';
import {
  EXCLUDED_PATH_PATTERN as untypedExcludedPattern,
  toPosix as untypedToPosix,
} from '../../../layout.mjs';
import { walkedPaths as untypedWalkedPaths } from '../../../../../../shared/project-files/tree-walk.mjs';
import { reachableNames as untypedReachableNames } from '../../../../../../shared/rules/round-trips/round-trips.mjs';

type Scan = {
  readonly tests: Set<string>[];
  readonly helpers: (readonly [string, Set<string>])[];
};
type Named = { readonly name: string };
type NamedPair = { readonly earlier: Named; readonly later: Named };
type Callers = Map<string, string[]>;

const readStamped: <Value>(
  cache: Map<string, { readonly stamp: string; readonly value: Value }>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;
const scriptKindOf: (file: string) => TypeScript.ScriptKind = untypedScriptKindOf;
const toPosix: (file: string) => string = untypedToPosix;
const walkedPaths: (
  root: string,
  options: {
    readonly skipDirectory: (absolute: string, entry: Named) => boolean;
    readonly includeLinks: undefined;
  },
) => string[] = untypedWalkedPaths;
const reachableNames: (
  names: readonly string[],
  helpers: ReadonlyMap<string, readonly string[]>,
) => Set<string> = untypedReachableNames;
const EXCLUDED_PATTERN: string = untypedExcludedPattern;

const TEST_CALLS = new Set(['it', 'test', 'specify']);
const EXCLUDED = new RegExp(EXCLUDED_PATTERN, 'u');
const files = new Map<string, { readonly stamp: string; readonly value: Scan }>();

function calleeOf(node: TypeScript.Node): TypeScript.Node | undefined {
  if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) {
    return node.expression;
  }
  return ts.isTaggedTemplateExpression(node) ? node.tag : undefined;
}

function rootName(expression: TypeScript.Node): string | undefined {
  const chain = [expression];
  for (const current of chain) {
    const inner = calleeOf(current);
    if (inner !== undefined) {
      chain.push(inner);
    }
  }
  const root = chain.at(-1) ?? expression;
  return ts.isIdentifier(root) ? root.text : undefined;
}

function namesIn(nodes: readonly TypeScript.Node[]): Set<string> {
  const names = new Set<string>();
  function visit(child: TypeScript.Node): void {
    if (ts.isIdentifier(child)) {
      names.add(child.text);
    }
    ts.forEachChild(child, visit);
  }
  for (const node of nodes) {
    visit(node);
  }
  return names;
}

function isFunction(
  node: TypeScript.Node | undefined,
): node is TypeScript.ArrowFunction | TypeScript.FunctionExpression {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function helperOf(node: TypeScript.Node): (readonly [string, Set<string>])[] {
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    return [[node.name.text, namesIn([node])]];
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    isFunction(node.initializer)
  ) {
    return [[node.name.text, namesIn([node.initializer])]];
  }
  return [];
}

function isTestCall(node: TypeScript.Node): node is TypeScript.CallExpression {
  const root = ts.isCallExpression(node) ? rootName(node.expression) : undefined;
  return root !== undefined && TEST_CALLS.has(root);
}

function scanned(file: string): Scan {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  const tests: Set<string>[] = [];
  const helpers: (readonly [string, Set<string>])[] = [];
  function visit(node: TypeScript.Node): void {
    if (isTestCall(node)) {
      tests.push(namesIn(node.arguments.slice(1)));
    }
    helpers.push(...helperOf(node));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { tests, helpers };
}

function callersOf(found: readonly Scan[]): Callers {
  const callers: Callers = new Map();
  for (const [helper, names] of found.flatMap(({ helpers }) => helpers)) {
    for (const name of names) {
      const known = callers.get(name) ?? [];
      known.push(helper);
      callers.set(name, known);
    }
  }
  return callers;
}

function reachingNames(callers: Callers, name: string): string[] {
  return [...reachableNames([name], callers)];
}

function covers(names: ReadonlySet<string>, reaching: readonly string[]): boolean {
  return reaching.some((name) => names.has(name));
}

function isSkipped(projectRoot: string, absolute: string, entry: Named): boolean {
  return entry.name.startsWith('.') || EXCLUDED.test(toPosix(path.relative(projectRoot, absolute)));
}

function testFilesOf(projectRoot: string): string[] {
  const layout = readLayout();
  return walkedPaths(projectRoot, {
    skipDirectory: (absolute, entry) => isSkipped(projectRoot, absolute, entry),
    includeLinks: undefined,
  }).filter(
    (file) => layout.isTestFile(file) && !layout.isExcluded(file) && !layout.isGeneratedPath(file),
  );
}

export function untestedPairs<Pair extends NamedPair>(
  projectRoot: string,
  pairs: readonly Pair[],
): Pair[] {
  const found = testFilesOf(projectRoot)
    .map((file) => readStamped(files, path.join(projectRoot, file), scanned))
    .filter((scan) => scan !== undefined);
  const callers = callersOf(found);
  const tests = found.flatMap((scan) => scan.tests);
  return pairs.filter(({ earlier, later }) => {
    const first = reachingNames(callers, earlier.name);
    const second = reachingNames(callers, later.name);
    return !tests.some((names) => covers(names, first) && covers(names, second));
  });
}
