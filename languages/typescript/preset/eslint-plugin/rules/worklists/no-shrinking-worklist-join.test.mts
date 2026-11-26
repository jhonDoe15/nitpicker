import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-shrinking-worklist-join.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'shrinkingJoin' as const }] };
}

const TRANSFER_DROPS =
  'function transfer(node, input) { const out = new Map(input); for (const [name, fact] of out) { if (input.has(node.weakens(name, fact))) out.delete(name); } return out; }\n';
const TRANSFER_KILLS =
  'function transfer(node, input) { const out = new Set(input); for (const name of node.assigned) out.delete(name); for (const name of node.read) out.add(name); return out; }\n';
const TRANSFER_ADDS =
  'function transfer(node, input) { const out = new Map(input); for (const name of node.read) out.set(name, true); return out; }\n';

tester.run('no-shrinking-worklist-join', rule, {
  valid: [
    `${TRANSFER_ADDS}export function solve(entry, input) { const work = [entry]; while (work.length > 0) { const node = work.pop(); const out = transfer(node, input.get(node)); for (const next of node.successors) { if (join(input.get(next), out)) work.push(next); } } }`,
    `${TRANSFER_DROPS}export function solve(entry, sent) { const work = [entry]; while (work.length > 0) { const node = work.pop(); const out = transfer(node, inputOf(node, sent)); for (const next of node.successors) { if (changed(sent, node, next, out)) work.push(next); } } }`,
    `${TRANSFER_DROPS}export function solve(entry, input) { const work = [entry]; while (work.length > 0) { const node = work.pop(); const out = transfer(node, input.get(node)); for (const next of node.successors) { work.push(next); } } }`,
    `${TRANSFER_KILLS}export function solve(entry, input) { const work = [entry]; while (work.length > 0) { const node = work.pop(); const out = transfer(node, input.get(node)); for (const next of node.successors) { if (union(input.get(next), out)) work.push(next); } } }`,
    'export function solve(entry, input, pending) { const work = [entry]; while (work.length) { const node = work.pop(); pending.delete(node); const out = input.get(node); for (const next of succ(node)) { if (merge(input.get(next), out)) work.push(next); } } }',
  ],
  invalid: [
    invalid(
      `${TRANSFER_DROPS}export function solve(entry, input) { const work = [entry]; while (work.length > 0) { const node = work.pop(); const out = transfer(node, input.get(node)); for (const next of node.successors) { if (join(input.get(next), out)) work.push(next); } } }`,
    ),
    invalid(
      'export function solve(entry, state) { const work = [entry]; for (const node of work) { const out = new Set(state[node.id]); if (node.kills) out.clear(); for (const next of node.successors) { if (mergeInto(state[next], out)) work.push(next); } } }',
    ),
    invalid(
      'export class Pass { run(entry) { const work = [entry]; while (work.length) { const node = work.shift(); const out = this.transfer(node); for (const next of node.successors) { if (unionInto(this.input.get(next), out)) work.push(next); } } } transfer(node) { const out = new Set(this.input.get(node)); for (const fact of out) { if (node.weakens(fact)) out.delete(fact); } return out; } }',
    ),
  ],
});
