import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unguarded-recursion-sibling.mts';

const ruleTester = typescriptRuleTester();

type Report = {
  readonly name: string;
  readonly sibling: string;
  readonly guard: string;
};

function failing(report: Report, code: string) {
  return {
    code,
    errors: [{ messageId: 'unguardedRecursionSibling' as const, data: report }],
  };
}

ruleTester.run('no-unguarded-recursion-sibling', rule, {
  valid: cases([
    'const visited = new Set<string>();\nfunction walkA(id: string) { if (visited.has(id)) return; visited.add(id); shared(id); }\nfunction walkB(id: string) { if (visited.has(id)) return; visited.add(id); shared(id); }\nfunction shared(id: string) { if (id.startsWith("a")) walkA(id); else walkB(id); }',
    'const cache = new Map<string, number>();\nfunction evalA(id: string): number { if (cache.has(id)) return cache.get(id)!; const out = shared(id); cache.set(id, out); return out; }\nfunction evalB(id: string): number { const hit = cache.get(id); if (hit !== undefined) return hit; const out = shared(id); cache.set(id, out); return out; }\nfunction shared(id: string): number { return id.length > 0 ? evalA(id) : evalB(id); }',
    'const MAX_DEPTH = 10;\nfunction walkA(node: string, depth = 0) { if (depth > MAX_DEPTH) return; shared(node, depth + 1); }\nfunction walkB(node: string, depth = 0) { if (depth > MAX_DEPTH) return; shared(node, depth + 1); }\nfunction shared(node: string, depth: number) { if (node.length > 1) walkA(node, depth); else walkB(node, depth); }',
    'class Walker {\n  private seen = new Set<string>();\n  walkA(id: string) { if (this.seen.has(id)) return; this.seen.add(id); this.shared(id); }\n  walkB(id: string) { if (this.seen.has(id)) return; this.seen.add(id); this.shared(id); }\n  shared(id: string) { if (id.length > 0) this.walkA(id); else this.walkB(id); }\n}',
    'const visited = new Set<string>();\nfunction walkA(id: string) { if (visited.has(id)) return; visited.add(id); shared(id); }\nfunction nonCyclicSibling(id: string) { shared(id); }\nfunction shared(id: string) { walkA(id); }',
    'const visited = new Set<string>();\nfunction walkA(id: string) { if (visited.has(id)) return; visited.add(id); shared(id); }\nfunction walkB(id: string) { walkA(id); }\nfunction shared(id: string) { if (id.length > 0) walkA(id); else walkB(id); }',
    'const visited = new Set<string>();\nfunction walkA(id: string) { if (visited.has(id)) return; visited.add(id); shared(id); }\nfunction shared(id: string) { walkA(id); }',
    'const visited = new Set<string>();\nfunction walkA(id: string) { if (visited.has(id)) return; visited.add(id); shared(id); }\nfunction walkB(id: string) { shared(id); }\nfunction shared(id: string) { if (visited.has(id)) return; visited.add(id); if (id.length > 0) walkA(id); else walkB(id); }',
    'const visited = new Set<string>();\nfunction walkA(id: string) { if (visited.has(id)) return; visited.add(id); sharedA(id); }\nfunction sharedA(id: string) { walkA(id); }\nfunction walkB(id: string) { sharedB(id); }\nfunction sharedB(id: string) { walkB(id); }',
    'function walkA(id: string) { const local = new Set<string>(); if (local.has(id)) return; local.add(id); shared(id); }\nfunction walkB(id: string) { shared(id); }\nfunction shared(id: string) { if (id.length > 0) walkA(id); else walkB(id); }',
    'const visited = new Set<string>();\nfunction walkA(id: string) { shared(id); if (visited.has(id)) return; visited.add(id); }\nfunction walkB(id: string) { shared(id); }\nfunction shared(id: string) { if (id.length > 0) walkA(id); else walkB(id); }',
  ]),
  invalid: [
    failing(
      { name: 'walkExpr', sibling: 'walkStmt', guard: 'visited' },
      'const visited = new Set<string>();\nfunction walkStmt(id: string) { if (visited.has(id)) return; visited.add(id); walkChildren(id); }\nfunction walkExpr(id: string) { walkChildren(id); }\nfunction walkChildren(id: string) { if (id.startsWith("s")) walkStmt(id); else walkExpr(id); }',
    ),
    failing(
      { name: 'resolveB', sibling: 'resolveA', guard: 'inProgress' },
      'const inProgress = new Set<string>();\nconst resolveA = (id: string) => { if (inProgress.has(id)) return; inProgress.add(id); dispatch(id); };\nconst resolveB = (id: string) => { dispatch(id); };\nconst dispatch = (id: string) => { if (id.length > 0) resolveA(id); else resolveB(id); };',
    ),
    failing(
      { name: 'evalB', sibling: 'evalA', guard: 'cache' },
      'const cache = new Map<string, number>();\nfunction evalA(id: string): number { if (cache.has(id)) return cache.get(id)!; const result = evalInner(id); cache.set(id, result); return result; }\nfunction evalB(id: string): number { return evalInner(id); }\nfunction evalInner(id: string): number { return id.length > 0 ? evalA(id) : evalB(id); }',
    ),
    failing(
      { name: 'computeB', sibling: 'computeA', guard: 'memo' },
      'const memo = new Map<string, string>();\nfunction computeA(key: string): string { const hit = memo.get(key); if (hit !== undefined) return hit; const value = computeShared(key); memo.set(key, value); return value; }\nfunction computeB(key: string): string { return computeShared(key); }\nfunction computeShared(key: string): string { return key.length > 1 ? computeA(key) : computeB(key); }',
    ),
    failing(
      { name: 'visitB', sibling: 'visitA', guard: 'depth' },
      'const MAX = 16;\nfunction visitA(node: string, depth = 0) { if (depth > MAX) return; visitChildren(node, depth + 1); }\nfunction visitB(node: string, depth = 0) { visitChildren(node, depth + 1); }\nfunction visitChildren(node: string, depth: number) { if (node.length > 0) visitA(node, depth); else visitB(node, depth); }',
    ),
    failing(
      { name: 'stepB', sibling: 'stepA', guard: 'turns' },
      'const LIMIT = 50;\nlet turns = 0;\nfunction stepA(id: string) { if (turns >= LIMIT) return; turns++; route(id); }\nfunction stepB(id: string) { route(id); }\nfunction route(id: string) { if (id.length > 0) stepA(id); else stepB(id); }',
    ),
    failing(
      { name: 'resolveAlias', sibling: 'resolveType', guard: 'this.visited' },
      'class Resolver {\n  private visited = new Set<string>();\n  resolveType(id: string) { if (this.visited.has(id)) return; this.visited.add(id); this.resolveMembers(id); }\n  resolveAlias(id: string) { this.resolveMembers(id); }\n  private resolveMembers(id: string) { this.dispatch(id); }\n  private dispatch(id: string) { if (id.length > 0) this.resolveType(id); else this.resolveAlias(id); }\n}',
    ),
    failing(
      { name: 'visitB', sibling: 'visitA', guard: 'this.#seen' },
      'class Graph {\n  #seen = new Set<string>();\n  visitA(id: string) { if (this.#seen.has(id)) return; this.#seen.add(id); this.#walk(id); }\n  visitB(id: string) { this.#walk(id); }\n  #walk(id: string) { if (id.length > 0) this.visitA(id); else this.visitB(id); }\n}',
    ),
    failing(
      { name: 'evalB', sibling: 'evalA', guard: 'this.cache' },
      'class Evaluator {\n  private cache = new Map<string, number>();\n  evalA(id: string): number { const cached = this.cache.get(id); if (cached !== undefined) return cached; const out = this.evalNode(id); this.cache.set(id, out); return out; }\n  evalB(id: string): number { return this.evalNode(id); }\n  evalNode(id: string): number { return id.length > 0 ? this.evalA(id) : this.evalB(id); }\n}',
    ),
    failing(
      { name: 'runB', sibling: 'runA', guard: 'this.turns' },
      'const LIMIT = 20;\nclass Runner {\n  private turns = 0;\n  runA(id: string) { if (this.turns >= LIMIT) return; this.turns += 1; this.dispatch(id); }\n  runB(id: string) { this.dispatch(id); }\n  dispatch(id: string) { if (id.length > 0) this.runA(id); else this.runB(id); }\n}',
    ),
    failing(
      { name: 'walkB', sibling: 'walkA', guard: 'active' },
      'const active = new Set<string>();\nexport function walkA(id: string) { if (active.has(id)) return; active.add(id); walkShared(id); }\nexport const walkB = function (id: string) { if (active.has(id)) return; walkShared(id); };\nfunction walkShared(id: string) { if (id.length > 0) walkA(id); else walkB(id); }',
    ),
    {
      code: 'const seen = new Set<string>();\nfunction a(id: string) { if (seen.has(id)) return; seen.add(id); shared(id); }\nfunction b1(id: string) { shared(id); }\nfunction b2(id: string) { shared(id); }\nfunction shared(id: string) { if (id === "a") a(id); else if (id === "1") b1(id); else b2(id); }',
      errors: [
        {
          messageId: 'unguardedRecursionSibling' as const,
          data: { name: 'b1', sibling: 'a', guard: 'seen' },
        },
        {
          messageId: 'unguardedRecursionSibling' as const,
          data: { name: 'b2', sibling: 'a', guard: 'seen' },
        },
      ],
    },
  ],
});
