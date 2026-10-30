import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../../failure-messages/test-support/harness.mjs';
import { strictSyntaxConfig } from '../strict.mjs';

const asserted = 'export const value = input as string;';
const loop = 'export function run(items) { for (const item of items) { use(item); } }';
const thenChain = 'export function run(task) { return task.then(use); }';
const defaultExport = 'export default function run() {}';

function messages(code, filename) {
  return failureMessagesFor({ config: strictSyntaxConfig, filename, code });
}

describe('no-restricted-syntax lists are unified across scopes', () => {
  it('applies the global and the domain-scoped bans to a domain file', () => {
    const file = 'src/main/features/x/domain/run.ts';

    expect([...new Set(messages(`${asserted}\n${loop}\n`, file))].sort()).toEqual([
      'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
      'domain/ code has no loops: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
    ]);
    expect(messages(defaultExport, file)).toEqual([
      'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files, `declare module` blocks and the framework files that need one (Next.js routes, Storybook stories, Expo Router screens). An exception fits only when a framework or library requires it.',
    ]);
  });

  it('applies the global and the adapters-scoped bans to an adapters file', () => {
    const file = 'src/main/features/x/adapters/run.ts';

    expect([...new Set(messages(`${asserted}\n${thenChain}\n`, file))].sort()).toEqual([
      'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
      'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work. An exception fits only when a framework or library requires it.',
    ]);
    expect(messages(defaultExport, file)).toEqual([
      'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files, `declare module` blocks and the framework files that need one (Next.js routes, Storybook stories, Expo Router screens). An exception fits only when a framework or library requires it.',
    ]);
  });

  it('applies the control-flow bans to shared and plain source files, not to tests', () => {
    const files = ['src/main/shared/run.ts', 'src/run.ts', 'src/main/features/x/service.ts'];
    const whileLoop = 'export function run() { while (more()) { step(); } }';
    const sameFor = (code) => files.map((file) => messages(code, file));
    expect(sameFor(whileLoop)).toEqual(
      files.map(() => ['for...of is the only loop; iterate the items with for...of.']),
    );
    expect(sameFor(thenChain)).toEqual(
      files.map(() => [
        'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work. An exception fits only when a framework or library requires it.',
      ]),
    );
    expect(sameFor('export const same = a == b;')).toEqual(
      files.map(() => ["Expected '===' and instead saw '=='."]),
    );
    expect(sameFor(loop)).toEqual(files.map(() => []));
    expect(messages('export function run() { while (more()) {} }', 'src/run.test.ts')).toEqual([
      'No matching configuration found for src/run.test.ts.',
    ]);
  });

  it('bans self-recursion in every production file, not in tests', () => {
    const recursive = 'export function retry(n) { return n > 0 ? retry(n - 1) : 0; }';

    expect(messages(recursive, 'src/main/features/x/domain/run.ts')).toEqual([
      "'retry' calls itself. domain/ has no loops and no recursion, so a walk over data of unknown depth (a tree) belongs in adapters/: for...of over a worklist, pushing each node's children onto it. Pass domain/ the flat result; flat data uses map, filter, flatMap or Object.fromEntries. An exception fits only when the recursion is bounded and deliberate.",
    ]);
    const files = [
      'src/main/features/x/adapters/run.ts',
      'src/main/composition-root.ts',
      'src/main/shared/run.ts',
    ];
    expect(files.map((file) => messages(recursive, file))).toEqual(
      files.map(() => [
        "'retry' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) { pending.push(...children) }). Flat data: map, filter, flatMap or Object.fromEntries. A component that renders itself in JSX is not reported. An exception fits only when the recursion is bounded and deliberate.",
      ]),
    );
    expect(messages(recursive, 'src/run.test.ts')).toEqual([
      'No matching configuration found for src/run.test.ts.',
    ]);
  });

  it('reports a domain loop or forEach once, with the domain message', () => {
    const file = 'src/main/features/x/domain/run.ts';

    expect(messages('export function run() { while (more()) {} }', file)).toEqual([
      'domain/ code has no loops: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
    ]);
    expect(messages('export function run(xs) { xs.forEach(use); }', file)).toEqual([
      'domain/ code does not use forEach: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
    ]);
  });
});
