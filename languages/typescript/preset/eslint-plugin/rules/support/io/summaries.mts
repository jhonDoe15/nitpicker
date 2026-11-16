import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { tsRunsWithCaller } from '../flow/sync-callbacks.mts';
import { memoized } from '../../../../../../../shared/values/caches/memo.mts';
import type { Effects } from './call-tags.mts';
import {
  calleeDeclaration,
  functionLike,
  type ImplementationState,
  type TsFunction,
} from './implementations.mts';
import { messagePackages, packageFromPath } from './packages.mts';
import { resolveCall, type Resolved } from './typed-calls.mts';

type SummaryState = ImplementationState & {
  readonly descriptors: Map<TsFunction, Resolved[]>;
  readonly summaries: Map<TsFunction, Map<number, Effects>>;
  readonly calls: Map<TypeScript.Node, Effects>;
};
type CallNode = TypeScript.CallExpression | TypeScript.TaggedTemplateExpression;

const MAX_HOPS = 3;
const BUDGETS = Array.from({ length: MAX_HOPS + 1 }, (_, budget) => budget);
const states = new WeakMap<TypeScript.Program, SummaryState>();
const publishers = new WeakMap<TypeScript.Program, boolean>();
const QUOTES = ["'", '"', '`'];

function stateOf(program: TypeScript.Program): SummaryState {
  return memoized(states, program, () => ({
    program,
    checker: program.getTypeChecker(),
    descriptors: new Map(),
    summaries: new Map(),
    calls: new Map(),
  }));
}

function runsWithCaller(node: TypeScript.Node): boolean {
  if (ts.isClassLike(node)) {
    return false;
  }
  return !ts.isFunctionLike(node) || tsRunsWithCaller(node);
}

function callsIn(root: TypeScript.Node): CallNode[] {
  const calls: CallNode[] = [];
  const pending = [root];
  for (const node of pending) {
    if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, (child) => {
      if (runsWithCaller(child)) {
        pending.push(child);
      }
    });
  }
  return calls;
}

function descriptorsOf(state: SummaryState, fn: TsFunction): Resolved[] {
  return memoized(state.descriptors, fn, () =>
    callsIn(fn.body).map((call) => resolveCall(state, call)),
  );
}

function discovered(state: SummaryState, roots: readonly TsFunction[]): Map<TsFunction, number> {
  const levels = new Map(roots.map((root): [TsFunction, number] => [root, 0]));
  const pending = [...roots];
  for (const fn of pending) {
    const level = levels.get(fn) ?? 0;
    const targets =
      level < MAX_HOPS ? descriptorsOf(state, fn).flatMap(({ targets = [] }) => targets) : [];
    for (const target of targets.filter((each) => !levels.has(each))) {
      levels.set(target, level + 1);
      pending.push(target);
    }
  }
  return levels;
}

function summaryAt(state: SummaryState, fn: TsFunction, budget: number): Effects {
  return state.summaries.get(fn)?.get(budget) ?? new Map<string, string[]>();
}

function prefixed(label: string, effects: Effects): Effects {
  return new Map([...effects].map(([tag, path]): [string, string[]] => [tag, [label, ...path]]));
}

function combined(state: SummaryState, descriptor: Resolved, budget: number): Effects {
  if (descriptor.effects !== undefined) {
    return descriptor.effects;
  }
  const [first = new Map<string, string[]>(), ...others] = descriptor.targets.map((target) =>
    summaryAt(state, target, budget),
  );
  const common = [...first].filter(([tag]) => others.every((summary) => summary.has(tag)));
  return prefixed(descriptor.view.label, new Map(common));
}

function isPropagated(descriptor: Resolved, budget: number): boolean {
  return descriptor.guessed !== true && (budget > 0 || descriptor.targets === undefined);
}

function evaluated(state: SummaryState, fn: TsFunction, budget: number): Effects {
  const effects: Effects = new Map(budget === 0 ? [] : summaryAt(state, fn, budget - 1));
  const entries = descriptorsOf(state, fn)
    .filter((descriptor) => isPropagated(descriptor, budget))
    .flatMap((descriptor) => [...combined(state, descriptor, budget - 1)]);
  for (const [tag, path] of entries) {
    effects.set(tag, effects.get(tag) ?? path);
  }
  return effects;
}

function summarize(state: SummaryState, roots: readonly TsFunction[]): void {
  const levels = discovered(state, roots);
  for (const budget of BUDGETS) {
    const due = [...levels].filter(([, level]) => level + budget <= MAX_HOPS);
    for (const [fn] of due) {
      const memo = memoized(state.summaries, fn, () => new Map<number, Effects>());
      memo.set(budget, memo.get(budget) ?? evaluated(state, fn, budget));
    }
  }
}

function resolvedEffects(state: SummaryState, call: CallNode): Effects {
  const descriptor = resolveCall(state, call);
  if (descriptor.targets !== undefined) {
    summarize(state, descriptor.targets);
  }
  return combined(state, descriptor, MAX_HOPS);
}

export function typedCallEffects(call: CallNode, program: TypeScript.Program): Effects {
  const state = stateOf(program);
  return memoized(state.calls, call, () => resolvedEffects(state, call));
}

export { stateOf as programState };

function importedText(specifier: unknown): string | undefined {
  if (typeof specifier !== 'object' || specifier === null || !('text' in specifier)) {
    return undefined;
  }
  return typeof specifier.text === 'string' ? specifier.text : undefined;
}

function mentionsBroker(file: TypeScript.SourceFile, specifiers: readonly string[]): boolean {
  if (file.isDeclarationFile) {
    const pkg = packageFromPath(file.fileName);
    return pkg !== undefined && specifiers.includes(pkg);
  }
  const imports: unknown = Reflect.get(file, 'imports');
  if (Array.isArray(imports)) {
    return imports.some((specifier: unknown) => {
      const text = importedText(specifier);
      return text !== undefined && specifiers.includes(text);
    });
  }
  return specifiers.some((specifier) =>
    QUOTES.some((quote) => file.text.includes(`${quote}${specifier}${quote}`)),
  );
}

export function programMayPublish(program: TypeScript.Program): boolean {
  return memoized(publishers, program, () =>
    program.getSourceFiles().some((file) => mentionsBroker(file, messagePackages())),
  );
}

export function typedReferenceEffects(node: TypeScript.Node, program: TypeScript.Program): Effects {
  const state = stateOf(program);
  const declaration = calleeDeclaration(state.checker, node);
  const fn = declaration === undefined ? undefined : functionLike(declaration);
  if (fn === undefined) {
    return new Map<string, string[]>();
  }
  summarize(state, [fn]);
  return prefixed(`${node.getText()}()`, summaryAt(state, fn, MAX_HOPS));
}
