import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unguarded-recursion-entry.mts';

const tester = typescriptRuleTester();

const SHAPES =
  'function shapes(node) { return node.args.map((arg) => (arg.kind === "call" ? resolveCall(arg) : resolveConstructor(arg))); }\n';
const GUARDED_CALL =
  'const inProgress = new Set();\nexport function resolveCall(call) { if (!inProgress.add(call)) return undefined; try { return pick(call, shapes(call)); } finally { inProgress.delete(call); } }\n';

tester.run('no-unguarded-recursion-entry', rule, {
  valid: [
    `${SHAPES}${GUARDED_CALL}export function resolveConstructor(created) { if (!inProgress.add(created)) return undefined; try { return pick(created, shapes(created)); } finally { inProgress.delete(created); } }`,
    `${SHAPES}${GUARDED_CALL}export function resolveConstructor(created) { return resolveCall(created); }`,
    `${SHAPES}${GUARDED_CALL}export function resolveConstructor(created) { return pick(created, []); }`,
    `${SHAPES}const inProgress = [];\nexport function resolveCall(call) { return pick(call, shapes(call)); }\nexport function resolveConstructor(created) { return pick(created, shapes(created)); }`,
  ],
  invalid: [
    {
      code: `${SHAPES}${GUARDED_CALL}export function resolveConstructor(created) { return pick(created, shapes(created)); }`,
      errors: [{ messageId: 'unguardedEntry' as const }],
    },
    {
      code: 'export class Resolver { private readonly turns = new Map(); call(node) { if ((this.turns.get(node) ?? 0) > 2) return undefined; this.turns.set(node, (this.turns.get(node) ?? 0) + 1); return this.args(node); } create(node) { return this.args(node); } args(node) { return node.args.map((arg) => (arg.isNew ? this.create(arg) : this.call(arg))); } }',
      errors: [{ messageId: 'unguardedEntry' as const }],
    },
  ],
});
