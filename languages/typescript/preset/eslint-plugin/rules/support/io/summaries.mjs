import ts from 'typescript';
import { tsRunsWithCaller } from '../flow/sync-callbacks.mjs';
import { memoized } from '../memo.mjs';
import { calleeDeclaration, functionLike } from './implementations.mjs';
import { messagePackages, packageFromPath } from './packages.mjs';
import { resolveCall } from './typed-calls.mjs';

const MAX_HOPS = 3;
const BUDGETS = Array.from({ length: MAX_HOPS + 1 }, (_, budget) => budget);
const states = new WeakMap();
const QUOTES = ["'", '"', '`'];

function stateOf(program) {
  return memoized(states, program, () => ({
    program,
    checker: program.getTypeChecker(),
    descriptors: new Map(),
    summaries: new Map(),
    calls: new Map(),
  }));
}

function runsWithCaller(node) {
  if (ts.isClassLike(node)) {
    return false;
  }
  return !ts.isFunctionLike(node) || tsRunsWithCaller(node);
}

function callsIn(root) {
  const calls = [];
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

function descriptorsOf(state, fn) {
  return memoized(state.descriptors, fn, () =>
    callsIn(fn.body).map((call) => resolveCall(state, call)),
  );
}

function discovered(state, roots) {
  const levels = new Map(roots.map((root) => [root, 0]));
  const pending = [...roots];
  for (const fn of pending) {
    const level = levels.get(fn);
    const targets =
      level < MAX_HOPS ? descriptorsOf(state, fn).flatMap(({ targets = [] }) => targets) : [];
    for (const target of targets.filter((each) => !levels.has(each))) {
      levels.set(target, level + 1);
      pending.push(target);
    }
  }
  return levels;
}

function summaryAt(state, fn, budget) {
  return state.summaries.get(fn)?.get(budget) ?? new Map();
}

function prefixed(label, effects) {
  return new Map([...effects].map(([tag, path]) => [tag, [label, ...path]]));
}

function combined(state, { view, effects, targets }, budget) {
  if (effects !== undefined) {
    return effects;
  }
  const [first, ...others] = targets.map((target) => summaryAt(state, target, budget));
  const common = [...first].filter(([tag]) => others.every((summary) => summary.has(tag)));
  return prefixed(view.label, new Map(common));
}

function isPropagated(descriptor, budget) {
  return descriptor.guessed !== true && (budget > 0 || descriptor.targets === undefined);
}

function evaluated(state, fn, budget) {
  const effects = new Map(budget === 0 ? [] : summaryAt(state, fn, budget - 1));
  const entries = descriptorsOf(state, fn)
    .filter((descriptor) => isPropagated(descriptor, budget))
    .flatMap((descriptor) => [...combined(state, descriptor, budget - 1)]);
  for (const [tag, path] of entries) {
    effects.set(tag, effects.get(tag) ?? path);
  }
  return effects;
}

function summarize(state, roots) {
  const levels = discovered(state, roots);
  for (const budget of BUDGETS) {
    const due = [...levels].filter(([, level]) => level + budget <= MAX_HOPS);
    for (const [fn] of due) {
      const memo = memoized(state.summaries, fn, () => new Map());
      memo.set(budget, memo.get(budget) ?? evaluated(state, fn, budget));
    }
  }
}

function resolvedEffects(state, call) {
  const descriptor = resolveCall(state, call);
  if (descriptor.targets !== undefined) {
    summarize(state, descriptor.targets);
  }
  return combined(state, descriptor, MAX_HOPS);
}

export function typedCallEffects(call, program) {
  const state = stateOf(program);
  return memoized(state.calls, call, () => resolvedEffects(state, call));
}

export { stateOf as programState };

function mentionsBroker(file, specifiers) {
  if (file.isDeclarationFile) {
    return specifiers.includes(packageFromPath(file.fileName));
  }
  if (file.imports !== undefined) {
    return file.imports.some((specifier) => specifiers.includes(specifier.text));
  }
  return specifiers.some((specifier) =>
    QUOTES.some((quote) => file.text.includes(`${quote}${specifier}${quote}`)),
  );
}

export function programMayPublish(program) {
  const state = stateOf(program);
  state.mayPublish ??= program
    .getSourceFiles()
    .some((file) => mentionsBroker(file, messagePackages()));
  return state.mayPublish;
}

export function typedReferenceEffects(node, program) {
  const state = stateOf(program);
  const declaration = calleeDeclaration(state.checker, node);
  const fn = declaration && functionLike(declaration);
  if (fn === undefined) {
    return new Map();
  }
  summarize(state, [fn]);
  return prefixed(`${node.getText()}()`, summaryAt(state, fn, MAX_HOPS));
}
