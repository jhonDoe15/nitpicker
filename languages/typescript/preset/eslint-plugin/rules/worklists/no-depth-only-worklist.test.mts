import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-depth-only-worklist.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'depthOnly' as const }] };
}

tester.run('no-depth-only-worklist', rule, {
  valid: [
    'export function reach(node) { const expanded = new Set(); const pending = [{ node, depth: 0 }]; for (const item of pending) { if (item.depth > 8 || expanded.has(item.node)) continue; expanded.add(item.node); pending.push(...childrenOf(item.node).map((child) => ({ node: child, depth: item.depth + 1 }))); } }',
    'export function reach(node) { const pending = [{ node, depth: 0 }]; for (const item of pending) { if (item.depth > 8) continue; pending.push({ node: next(item.node), depth: item.depth + 1 }); } }',
    'export function reach(root) { const pending = [{ node: root, depth: 0 }]; for (const item of pending) { if (item.depth > 8) continue; pending.push(...item.node.children.map((child) => ({ node: child, depth: item.depth + 1 }))); } }',
    'export function reach(root) { const pending = [root]; for (const node of pending) { pending.push(...childrenOf(node)); } }',
    'export function reach(root) { const pending = [{ node: root, depth: 0 }]; while (pending.length > 0) { const item = pending.pop(); if (item.depth > 4 || item.node.visited) continue; item.node.visited = true; for (const child of childrenOf(item.node)) pending.push({ node: child, depth: item.depth + 1 }); } }',
    'export function reach(root) { const pending = [{ node: root, depth: 0 }]; const out = []; for (const item of pending) { if (item.depth > 3) continue; out.push(...childrenOf(item.node)); } return out; }',
    'export function reach(root) { const pending = [{ node: root, depth: 0 }]; for (const item of pending) { if (item.depth > 8) continue; for (const child of item.node.children) { pending.push({ node: child, depth: item.depth + 1 }); } } }',
    'export function reach(root, depth) { const pending = [root]; while (pending.length > 0) { const node = pending.pop(); if (depth < 5) { log(node); } for (const child of sourcesOf(node)) pending.push(child); } }',
  ],
  invalid: [
    invalid(
      'export class Walker { pending = []; run(node) { for (const item of this.pending) { if (item.depth > 8) continue; this.pending.push(...sourcesOf(item.node).map((next) => ({ node: next, depth: item.depth + 1 }))); } } }',
    ),
    invalid(
      'export function reach(node) { const pending = [{ node, depth: 0 }]; for (const item of pending) { if (item.depth > 8) continue; pending.push(...childrenOf(item.node).map((child) => ({ node: child, depth: item.depth + 1 }))); } }',
    ),
    invalid(
      'export function reach(root) { const queue = [[root, 0]]; while (queue.length > 0) { const [node, level] = queue.shift(); if (level >= 5) continue; for (const source of sourcesOf(node)) { queue.push([source, level + 1]); } } }',
    ),
    invalid(
      'export function reach(root) { const pending = [{ node: root, depth: 0 }]; for (const { node, depth } of pending) { if (depth < 6) { pending.push({ node: node.left, depth: depth + 1 }); pending.push({ node: node.right, depth: depth + 1 }); } } }',
    ),
  ],
});
