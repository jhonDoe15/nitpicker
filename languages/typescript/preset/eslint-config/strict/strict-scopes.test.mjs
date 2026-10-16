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
      'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files.',
    ]);
  });

  it('applies the global and the adapters-scoped bans to an adapters file', () => {
    const file = 'src/main/features/x/adapters/run.ts';

    expect([...new Set(messages(`${asserted}\n${thenChain}\n`, file))].sort()).toEqual([
      'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
      'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
    ]);
    expect(messages(defaultExport, file)).toEqual([
      'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files.',
    ]);
  });

  it('applies the control-flow bans to shared and plain source files, not to tests', () => {
    for (const file of ['src/main/shared/run.ts', 'src/run.ts', 'src/main/features/x/service.ts']) {
      expect(messages('export function run() { while (more()) { step(); } }', file)).toEqual([
        'for...of is the only loop; iterate the items with for...of.',
      ]);
      expect(messages(thenChain, file)).toEqual([
        'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
      ]);
      expect(messages('export const same = a == b;', file)).toEqual([
        "Expected '===' and instead saw '=='.",
      ]);
      expect(messages(loop, file)).toEqual([]);
    }
    expect(messages('export function run() { while (more()) {} }', 'src/run.test.ts')).toEqual([
      'No matching configuration found for src/run.test.ts.',
    ]);
  });

  it('bans self-recursion in every production file, not in tests', () => {
    const recursive = 'export function retry(n) { return n > 0 ? retry(n - 1) : 0; }';

    expect(messages(recursive, 'src/main/features/x/domain/run.ts')).toEqual([
      "'retry' calls itself. domain/ has no loops and no recursion, so a walk over data of unknown depth (a tree) belongs in adapters/: for...of over a worklist, pushing each node's children onto it. Pass domain/ the flat result; flat data uses map, filter, flatMap or Object.fromEntries. An exception fits only when the recursion is bounded and deliberate.",
    ]);
    for (const file of [
      'src/main/features/x/adapters/run.ts',
      'src/main/composition-root.ts',
      'src/main/shared/run.ts',
    ]) {
      expect(messages(recursive, file)).toEqual([
        "'retry' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) { pending.push(...children) }). Flat data: map, filter, flatMap or Object.fromEntries. A component that renders itself in JSX is not reported. An exception fits only when the recursion is bounded and deliberate.",
      ]);
    }
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
