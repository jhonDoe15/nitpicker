import ts from 'typescript';
import { memoized } from '../memo.mjs';
import { resolveCall } from './typed-calls.mjs';

const MAX_HOPS = 3;
const BUDGETS = Array.from({ length: MAX_HOPS + 1 }, (_, budget) => budget);
const states = new WeakMap();

function stateOf(program) {
  return memoized(states, program, () => ({
    program,
    checker: program.getTypeChecker(),
    descriptors: new Map(),
    summaries: new Map(),
  }));
}

function runsWithCaller(node) {
  const isCallback = ts.isCallExpression(node.parent) && node.parent.arguments.includes(node);
  return !(ts.isFunctionLike(node) || ts.isClassLike(node)) || isCallback;
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

function evaluated(state, fn, budget) {
  const effects = new Map();
  const entries = descriptorsOf(state, fn).flatMap((descriptor) => [
    ...(budget === 0 && descriptor.targets !== undefined
      ? []
      : combined(state, descriptor, budget - 1)),
  ]);
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

export function typedCallEffects(call, program) {
  const state = stateOf(program);
  const descriptor = resolveCall(state, call);
  if (descriptor.targets !== undefined) {
    summarize(state, descriptor.targets);
  }
  return combined(state, descriptor, MAX_HOPS);
}
