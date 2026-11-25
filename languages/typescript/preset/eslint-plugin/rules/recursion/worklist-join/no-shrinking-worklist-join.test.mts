import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-shrinking-worklist-join.mts';

const ruleTester = typescriptRuleTester();

function failing(state: string, code: string) {
  return {
    code,
    errors: [{ messageId: 'shrinkingWorklistJoin' as const, data: { state } }],
  };
}

ruleTester.run('no-shrinking-worklist-join', rule, {
  valid: cases([
    'function run(worklist: string[], state: Map<string, Set<string>>, gens: Map<string, string[]>, succs: Map<string, string[]>) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = new Set(state.get(node));\n    for (const g of gens.get(node) ?? []) out.add(g);\n    for (const next of succs.get(node) ?? []) {\n      const target = state.get(next)!;\n      let changed = false;\n      for (const v of out) {\n        if (!target.has(v)) {\n          target.add(v);\n          changed = true;\n        }\n      }\n      if (changed) worklist.push(next);\n    }\n  }\n}',
    'function run(queue: number[], inQueue: Set<number>, state: number[], gen: number[], succs: number[][]) {\n  while (queue.length > 0) {\n    const node = queue.shift()!;\n    inQueue.delete(node);\n    const out = state[node] | gen[node];\n    for (const next of succs[node]) {\n      const prev = state[next];\n      state[next] |= out;\n      if (state[next] !== prev && !inQueue.has(next)) {\n        inQueue.add(next);\n        queue.push(next);\n      }\n    }\n  }\n}',
    'function run(work: Set<string>, state: Map<string, Set<string>>, gens: Map<string, string[]>, succs: Map<string, string[]>) {\n  while (work.size > 0) {\n    const [node] = work;\n    work.delete(node);\n    const out = new Set(state.get(node));\n    for (const g of gens.get(node) ?? []) out.add(g);\n    for (const next of succs.get(node) ?? []) {\n      const merged = union(state.get(next)!, out);\n      if (merged.size > state.get(next)!.size) {\n        state.set(next, merged);\n        work.add(next);\n      }\n    }\n  }\n}',
    'function run(queue: number[], state: number[], succs: number[][]) {\n  while (queue.length > 0) {\n    const node = queue.shift()!;\n    const out = state[node] + 1;\n    for (const next of succs[node]) {\n      const merged = Math.max(state[next], out);\n      if (merged !== state[next]) {\n        state[next] = merged;\n        queue.push(next);\n      }\n    }\n  }\n}',
    'function transfer(input: Map<string, number>, gens: Map<string, number>) {\n  const out = new Map(input);\n  for (const [k, v] of gens) out.set(k, Math.max(out.get(k) ?? 0, v));\n  return out;\n}\nfunction run(worklist: string[], state: Map<string, Map<string, number>>, gens: Map<string, Map<string, number>>, succs: Map<string, string[]>) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = transfer(state.get(node)!, gens.get(node)!);\n    for (const next of succs.get(node) ?? []) {\n      if (merge(state.get(next)!, out)) worklist.push(next);\n    }\n  }\n}',
    'function bfs(queue: string[], graph: Map<string, string[]>) {\n  const visited = new Set<string>();\n  while (queue.length > 0) {\n    const node = queue.shift()!;\n    for (const next of graph.get(node) ?? []) {\n      if (!visited.has(next)) {\n        visited.add(next);\n        queue.push(next);\n      }\n    }\n  }\n}',
    'function dfs(stack: string[], graph: Map<string, string[]>, active: Set<string>) {\n  const seen = new Set<string>();\n  while (stack.length > 0) {\n    const node = stack.pop()!;\n    active.delete(node);\n    for (const next of graph.get(node) ?? []) {\n      if (!seen.has(next)) {\n        seen.add(next);\n        stack.push(next);\n      }\n    }\n  }\n}',
    'function run(worklist: string[], state: Map<string, Set<string>>, kills: Map<string, string[]>, succs: Map<string, string[]>, preds: Map<string, string[]>, edgeOut: Map<string, Set<string>>) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = new Set(state.get(node));\n    for (const k of kills.get(node) ?? []) out.delete(k);\n    for (const next of succs.get(node) ?? []) {\n      edgeOut.set(`${node}->${next}`, out);\n      const recomputed = new Set<string>();\n      for (const pred of preds.get(next) ?? []) {\n        for (const v of edgeOut.get(`${pred}->${next}`) ?? []) recomputed.add(v);\n      }\n      if (recomputed.size !== state.get(next)!.size) {\n        state.set(next, recomputed);\n        worklist.push(next);\n      }\n    }\n  }\n}',
    'function run(worklist: string[], state: Map<string, Set<string>>, kills: Map<string, string[]>, succs: Map<string, string[]>, preds: Map<string, string[]>, edgeOut: Map<string, Set<string>>) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = new Set(state.get(node));\n    for (const k of kills.get(node) ?? []) out.delete(k);\n    edgeOut.set(node, out);\n    for (const next of succs.get(node) ?? []) {\n      const target = state.get(next)!;\n      const prevSize = target.size;\n      target.clear();\n      for (const pred of preds.get(next) ?? []) {\n        for (const v of edgeOut.get(pred) ?? []) target.add(v);\n      }\n      if (target.size !== prevSize) worklist.push(next);\n    }\n  }\n}',
    'function drain(queue: string[], state: Map<string, Set<string>>) {\n  while (queue.length > 0) {\n    const node = queue.shift()!;\n    state.get(node)?.clear();\n  }\n}',
    'function run(queue: string[], state: Map<string, number>, succs: Map<string, string[]>) {\n  while (queue.length > 0) {\n    const node = queue.shift()!;\n    const input = state.get(node);\n    const out = input === undefined ? 0 : input + 1;\n    for (const next of succs.get(node) ?? []) {\n      const prev = state.get(next) ?? 0;\n      const merged = Math.max(prev, out);\n      if (merged !== prev) {\n        state.set(next, merged);\n        queue.push(next);\n      }\n    }\n  }\n}',
  ]),
  invalid: [
    failing(
      'state',
      'function run(worklist: string[], state: Map<string, Set<string>>, kills: Map<string, string[]>, succs: Map<string, string[]>) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = new Set(state.get(node));\n    for (const k of kills.get(node) ?? []) out.delete(k);\n    for (const next of succs.get(node) ?? []) {\n      const target = state.get(next)!;\n      let changed = false;\n      for (const v of out) {\n        if (!target.has(v)) {\n          target.add(v);\n          changed = true;\n        }\n      }\n      if (changed) worklist.push(next);\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function run(queue: number[], state: Map<string, string>[], graph: number[][], isReset: (n: number) => boolean) {\n  while (queue.length > 0) {\n    const node = queue.shift()!;\n    const out = new Map(state[node]);\n    if (isReset(node)) out.clear();\n    for (const next of graph[node]) {\n      if (join(state[next], out)) queue.push(next);\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function transfer(node: string, input: Set<string>): Set<string> {\n  const out = new Set(input);\n  if (out.has(node)) out.delete("tag");\n  return out;\n}\nfunction run(work: Set<string>, state: Map<string, Set<string>>, edges: Map<string, string[]>) {\n  while (work.size > 0) {\n    const [node] = work;\n    work.delete(node);\n    const out = transfer(node, state.get(node)!);\n    for (const next of edges.get(node) ?? []) {\n      const merged = merge(state.get(next)!, out);\n      if (merged.size > state.get(next)!.size) {\n        state.set(next, merged);\n        work.add(next);\n      }\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function run(worklist: number[], state: number[], kill: number[], gen: number[], succs: number[][]) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = (state[node] & ~kill[node]) | gen[node];\n    for (const next of succs[node]) {\n      const prev = state[next];\n      state[next] |= out;\n      if (state[next] !== prev) worklist.push(next);\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function run(queue: string[], state: Map<string, number>, limit: Map<string, number>, adj: Map<string, string[]>) {\n  while (queue.length > 0) {\n    const node = queue.shift()!;\n    const out = Math.min(state.get(node) ?? 0, limit.get(node) ?? 10);\n    for (const next of adj.get(node) ?? []) {\n      const prev = state.get(next) ?? 0;\n      const merged = Math.max(prev, out);\n      if (merged !== prev) {\n        state.set(next, merged);\n        queue.push(next);\n      }\n    }\n  }\n}',
    ),
    failing(
      'state',
      'const UNKNOWN = "unknown";\nfunction run(worklist: string[], state: Map<string, Map<string, string>>, clobbers: Map<string, string>, succs: Map<string, string[]>) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = new Map(state.get(node));\n    if (clobbers.has(node)) out.set(clobbers.get(node)!, UNKNOWN);\n    for (const next of succs.get(node) ?? []) {\n      const merged = union(state.get(next)!, out);\n      if (merged.size !== state.get(next)!.size) {\n        state.set(next, merged);\n        worklist.push(next);\n      }\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function run(worklist: number[], state: Record<string, string | null>[], resetKey: (n: number) => string, succs: number[][]) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = { ...state[node] };\n    out[resetKey(node)] = null;\n    for (const next of succs[node]) {\n      const merged = { ...state[next], ...out };\n      if (merged !== state[next]) {\n        state[next] = merged;\n        worklist.push(next);\n      }\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function run(worklist: number[], state: Record<string, number>[], keyOf: (n: number) => string, succs: number[][]) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = { ...state[node] };\n    delete out[keyOf(node)];\n    for (const next of succs[node]) {\n      Object.assign(state[next], out);\n      worklist.push(next);\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function run(worklist: number[], state: number[], isReset: (n: number) => boolean, succs: number[][]) {\n  while (worklist.length > 0) {\n    const node = worklist.pop()!;\n    const out = isReset(node) ? 0 : state[node] + 1;\n    for (const next of succs[node]) {\n      const merged = Math.max(state[next], out);\n      if (merged !== state[next]) {\n        state[next] = merged;\n        worklist.push(next);\n      }\n    }\n  }\n}',
    ),
    failing(
      'this.state',
      'class Analyzer {\n  private worklist: string[] = [];\n  private state = new Map<string, Set<string>>();\n  private succs = new Map<string, string[]>();\n  private transfer(node: string): Set<string> {\n    const out = new Set(this.state.get(node));\n    out.delete(node);\n    return out;\n  }\n  solve() {\n    while (this.worklist.length > 0) {\n      const node = this.worklist.pop()!;\n      const out = this.transfer(node);\n      for (const next of this.succs.get(node) ?? []) {\n        for (const v of out) this.state.get(next)!.add(v);\n        this.worklist.push(next);\n      }\n    }\n  }\n}',
    ),
    failing(
      'state',
      'function run(work: Set<string>, state: Map<string, Set<string>>, succs: Map<string, string[]>) {\n  const step = (input: Set<string>) => {\n    const out = new Set(input);\n    out.clear();\n    return out;\n  };\n  while (work.size > 0) {\n    const node = work.values().next().value!;\n    work.delete(node);\n    const out = step(state.get(node)!);\n    for (const next of succs.get(node) ?? []) {\n      for (const v of out) state.get(next)!.add(v);\n      work.add(next);\n    }\n  }\n}',
    ),
  ],
});
