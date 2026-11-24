import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-cached-partial-recursion.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/resolver.ts';

const err = (cache: string, guard: string) => ({
  messageId: 'cachedPartialRecursion' as const,
  data: { cache, guard },
});

const fn = (body: string, params = 'node: Node') => `function typeOf(${params}): Type { ${body} }`;

tester.run('no-cached-partial-recursion', rule, {
  valid: [
    fn(
      'const known = cache.get(node); if (known) return known; const found = compute(node); cache.set(node, found); return found;',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) { partial = true; return UNKNOWN; } inProgress.add(node); try { const found = compute(node); if (!partial) { cache.set(node, found); } return found; } finally { inProgress.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (visiting.has(node)) return UNKNOWN; visiting.add(node); try { const found = compute(node); if (!hitCycle) cache.set(node, found); return found; } finally { visiting.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); let found: Type; try { found = compute(node); } finally { inProgress.delete(node); } if (inProgress.size === 0) { cache.set(node, found); } return found;',
    ),
    'class Resolver { typeOf(node: Node): Type { const known = this.cache.get(node); if (known) return known; if (this.inProgress.has(node)) return UNKNOWN; this.inProgress.add(node); try { const found = this.compute(node); if (this.inProgress.size === 1) { this.cache.set(node, found); } return found; } finally { this.inProgress.delete(node); } } }',
    fn(
      'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); try { const found = compute(node); if (truncated) return found; cache.set(node, found); return found; } finally { inProgress.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) { sawLoop = true; return UNKNOWN; } inProgress.add(node); try { const found = compute(node); if (!sawLoop) cache.set(node, found); return found; } finally { inProgress.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (depth > MAX_DEPTH) return UNKNOWN; const found = typeOf(node.child, depth + 1); if (depth === 0) { cache.set(node, found); } return found;',
      'node: Node, depth = 0',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); try { const found = compute(node); !partial && cache.set(node, found); return found; } finally { inProgress.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) return UNKNOWN; const seed = createSeed(); cache.set(node, seed); inProgress.add(node); try { populate(node, seed); return seed; } finally { inProgress.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); try { const seed = { kind: "pending" }; cache.set(node, seed); populate(node, seed); return seed; } finally { inProgress.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (ignored.has(node)) return UNKNOWN; const found = compute(node); cache.set(node, found); return found;',
    ),
    fn(
      'if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); try { const found = compute(node); cache.set(node, found); return found; } finally { inProgress.delete(node); }',
    ),
    fn(
      'const known = cache.get(node); if (known) return known; if (depth <= 0) return UNKNOWN; const found = compute(node); cache.set(node, found); return found;',
      'node: Node, depth: number',
    ),
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: fn(
        'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); try { const found = compute(node); cache.set(node, found); return found; } finally { inProgress.delete(node); }',
      ),
      errors: [err('cache', 'inProgress')],
    },
    {
      code: fn(
        'if (id in memo) return memo[id]; if (visiting.has(id)) return FALLBACK; visiting.add(id); try { const value = compute(id); memo[id] = value; return value; } finally { visiting.delete(id); }',
        'id: string',
      ),
      errors: [err('memo', 'visiting')],
    },
    {
      code: 'class Resolver { resolve(node: Node): Type { const known = this.cache.get(node); if (known) return known; if (this.active.has(node)) return UNKNOWN; this.active.add(node); try { const found = this.compute(node); this.cache.set(node, found); return found; } finally { this.active.delete(node); } } }',
      errors: [err('this.cache', 'this.active')],
    },
    {
      code: 'function typeOf(node: Node): Type { const known = cache.get(node); if (known) return known; const found = computeType(node); cache.set(node, found); return found; } function computeType(node: Node): Type { if (visiting.has(node)) return UNKNOWN; visiting.add(node); try { return walk(node); } finally { visiting.delete(node); } }',
      errors: [err('cache', 'visiting')],
    },
    {
      code: 'class Analyzer { typeOf(node: Node): Type { const known = this.cache.get(node); if (known) return known; const found = this.computeType(node); this.cache.set(node, found); return found; } computeType(node: Node): Type { if (this.seen.has(node)) return UNKNOWN; this.seen.add(node); try { return this.walk(node); } finally { this.seen.delete(node); } } }',
      errors: [err('this.cache', 'this.seen')],
    },
    {
      code: fn(
        'const known = cache.get(node); if (known) return known; function inner(n: Node): Type { if (visited.has(n)) return UNKNOWN; visited.add(n); try { return walk(n); } finally { visited.delete(n); } } const found = inner(node); cache.set(node, found); return found;',
      ),
      errors: [err('cache', 'visited')],
    },
    {
      code: fn(
        'const known = cache.get(node); if (known) return known; if (depth > MAX_DEPTH) return UNKNOWN; const found = typeOf(node.child, depth + 1); cache.set(node, found); return found;',
        'node: Node, depth = 0',
      ),
      errors: [err('cache', 'depth')],
    },
    {
      code: 'class Evaluator { evaluate(node: Node): Type { if (this.memo.has(node)) return this.memo.get(node); if (this.turns >= 10) return UNKNOWN; this.turns++; try { const value = this.step(node); this.memo.set(node, value); return value; } finally { this.turns--; } } }',
      errors: [err('this.memo', 'this.turns')],
    },
    {
      code: fn(
        'const known = cache.get(node); if (known) return known; if (stack.includes(node)) return UNKNOWN; stack.push(node); try { const found = compute(node); cache.set(node, found); return found; } finally { stack.pop(); }',
      ),
      errors: [err('cache', 'stack')],
    },
    {
      code: fn(
        'const known = cache.get(node); if (known) return known; if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); try { const found = compute(node); if (found !== null) { cache.set(node, found); } return found; } finally { inProgress.delete(node); }',
      ),
      errors: [err('cache', 'inProgress')],
    },
    {
      code: fn(
        'if (cache.has(node)) return cache.get(node); if (inProgress.has(node)) return UNKNOWN; inProgress.add(node); try { cache.set(node, compute(node)); return cache.get(node); } finally { inProgress.delete(node); }',
      ),
      errors: [err('cache', 'inProgress')],
    },
  ].map(({ code, errors }) => ({ filename, code, errors })),
});
