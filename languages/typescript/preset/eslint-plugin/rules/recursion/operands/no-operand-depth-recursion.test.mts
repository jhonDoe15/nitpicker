import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-operand-depth-recursion.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'operandRecursion' as const }] };
}

tester.run('no-operand-depth-recursion', rule, {
  valid: [
    'export function size(node) { return node.kind === "binary" ? size(node.right) + 1 : 1; }',
    'export function size(node, depth) { if (depth > 200) throw new Error("too deep"); return node.kind === "binary" ? size(node.left, depth + 1) + size(node.right, depth + 1) : 1; }',
    'export function size(node) { let total = 0; for (let current = node; current.kind === "binary"; current = current.left) { total += size(node.right); } return total; }',
    'export function pair(node) { return [other(node.left), other(node.right)]; }\nfunction other(node) { return node; }',
    'export function sum(a, b) { return sum(b.left, a.right); }',
    'export function walk(node) { const left = node.left; return walk(node.right) + walk(left.left); }',
    'export function height(node) { return node ? 1 + Math.max(height(node.left), height(node.right)) : 0; }',
    'export function evaluate(node, d) { if (d > 100) throw new Error("too deep"); return node.operator ? evaluate(node.left, d + 1) + evaluate(node.right, d + 1) : node.value; }',
    'export function evaluate(e) { return [e].map((e) => evaluate(e.left) + evaluate(e.right) + e.operator); }',
  ],
  invalid: [
    invalid(
      'export function evaluate(node) { if (node.kind === "binary") return apply(node.operator, evaluate(node.left), evaluate(node.right)); return node.value; }',
    ),
    invalid(
      'export const size = (node) => node.kind === "binary" ? size(node.left) + size(node.right) : 1;',
    ),
    invalid(
      'export class Printer { print(node) { return node.left ? this.print(node.left) + node.operator + this.print(node.right) : node.text; } }',
    ),
    invalid(
      'export function size(expr: { lhs?: any; rhs?: any; operator: string }): number { return expr.lhs ? size(expr.lhs!) + size(expr.rhs as any) : 1; }',
    ),
  ],
});
