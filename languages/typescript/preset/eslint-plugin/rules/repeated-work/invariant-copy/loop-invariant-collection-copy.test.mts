import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './loop-invariant-collection-copy.mts';

const tester = typescriptRuleTester();
const prodFile = '/repo/src/engine/process.ts';
const err = [{ messageId: 'loopInvariantCopy' }];

tester.run('loop-invariant-collection-copy', rule, {
  valid: [
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { const copy = [...shared]; copy.push(item); out.push(copy); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { const copy = { ...shared }; copy.id = item; out.push(copy); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { const copy = new Map(shared); copy.set(item, true); out.push(copy); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { const copy = new Set(shared); copy.add(item); out.push(copy); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { shared.push(item); out.push([...shared]); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { shared = next(item); out.push(shared.slice()); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(items) { const small = [1, 2, 3]; return items.map(() => [...small]); }',
    },
    {
      filename: prodFile,
      code: 'export function run(items) { const small = { a: 1, b: 2 }; return items.map(() => ({ ...small })); }',
    },
    {
      filename: prodFile,
      code: 'export function run(shared) { const out = []; for (const x of [1, 2, 3]) { out.push({ x, list: [...shared] }); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(shared) { return [1, 2, 3].map(() => shared.slice()); }',
    },
    {
      filename: prodFile,
      code: 'export function run(shared) { const out = []; for (let i = 0; i < 5; i++) { out.push([...shared]); } return out; }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { return items.map((item) => ({ ...shared, id: item.id })); }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { return items.map((item) => Object.assign({ ...shared }, item)); }',
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { return items.map((item) => Array.from(shared, (x) => x + item)); }',
    },
    {
      filename: prodFile,
      code: 'export function run(items) { return items.map((item) => [...item.tags]); }',
    },
    {
      filename: '/repo/src/engine/process.test.ts',
      code: 'export function run(items, shared) { return items.map(() => [...shared]); }',
    },
    {
      filename: '/repo/tests/process.ts',
      code: 'export function run(items, shared) { const out = []; for (const item of items) { out.push(structuredClone(shared)); } return out; }',
    },
  ],
  invalid: [
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { out.push({ item, tags: [...shared] }); } return out; }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { return items.map(() => shared.slice()); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { return items.map(() => Array.from(shared)); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; items.forEach((item) => { out.push({ ...shared }); }); return out; }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { return items.flatMap(() => [new Map(shared)]); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { return items.reduce((acc, item) => { acc.set(item, new Set(shared)); return acc; }, new Map()); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (let i = 0; i < items.length; i++) { out.push(structuredClone(shared)); } return out; }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; while (items.length > 0) { items.pop(); out.push(Buffer.from(shared)); } return out; }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { const out = []; for (const item of items) { const copy = [...shared]; out.push(copy); } return out; }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function run(items, shared) { for (const item of items) { item.defaults = { ...shared }; } }',
      errors: err,
    },
  ],
});
