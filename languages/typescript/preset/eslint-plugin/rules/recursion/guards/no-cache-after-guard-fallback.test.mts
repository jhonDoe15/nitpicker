import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-cache-after-guard-fallback.mts';

const tester = typescriptRuleTester();

const HEADER = 'const cache = new Map();\nconst inProgress = new Set();\n';

function invalid(code: string) {
  return { code: `${HEADER}${code}`, errors: [{ messageId: 'partialCache' as const }] };
}

tester.run('no-cache-after-guard-fallback', rule, {
  valid: [
    `${HEADER}export function typeOf(node) { const known = cache.get(node); if (known) return known; if (!inProgress.add(node)) return "unknown"; try { const found = node.args.map(typeOf); return found; } finally { inProgress.delete(node); } }`,
    `${HEADER}export function typeOf(node) { if (!inProgress.add(node)) return "unknown"; const found = combine(node); cache.set(node, found); return found; }\nfunction combine(node) { return node.kind; }`,
    `${HEADER}export function typeOf(node, partial = { hit: false }) { if (!inProgress.add(node)) { partial.hit = true; return "unknown"; } const found = node.args.map((arg) => typeOf(arg, partial)); if (!partial.hit) cache.set(node, found); return found; }`,
    `${HEADER}export function typeOf(node) { cache.set(node, "pending"); if (!inProgress.add(node)) return "unknown"; return node.args.map(typeOf); }`,
    `${HEADER}export function typeOf(node) { const seen = inProgress.has(node); cache.set(node, seen); return node.args.map(typeOf); }`,
    `${HEADER}export function typeOf(node) { if (node.ok) { inProgress.add(node); } cache.set(node, 1); return node.args.map(typeOf); }`,
    `${HEADER}export function typeOf(node) { if (!inProgress.add(node)) { log(node); } cache.set(node, 1); return node.args.map(typeOf); }`,
  ],
  invalid: [
    invalid(
      'export function typeOf(node) { const known = cache.get(node); if (known !== undefined) return known; if (!inProgress.add(node)) return "unknown"; try { const found = node.args.map((arg) => typeOf(arg)); cache.set(node, found); return found; } finally { inProgress.delete(node); } }',
    ),
    invalid(
      'export function typeOf(node) { if (inProgress.has(node)) { return "unknown"; } inProgress.add(node); const found = compute(node); inProgress.delete(node); cache.set(node, found); return found; }\nfunction compute(node) { return node.args.map(typeOf); }',
    ),
  ],
});
