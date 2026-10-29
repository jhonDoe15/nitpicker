import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { applyJavascriptDialect } from '../../../../javascript/preset/eslint-dialect.mjs';
import { routedEslintMessage } from '../../../adapters/hints/eslint-hints.mjs';
import { defaultResolvedLayout, resolveLayout } from '../../layout.mjs';
import { applyRuleExceptions } from '../exceptions.mjs';
import { atomicUpdateConfigFor } from './atomic-updates.mjs';

const rule = 'nitpicker/require-atomic-updates';
const parser = { languageOptions: { parser: tseslint.parser } };
const config = [{ ...atomicUpdateConfigFor(defaultResolvedLayout), ...parser }];
const javascriptLayout = resolveLayout({}, [], { javascript: true });
const javascriptConfig = applyJavascriptDialect(
  [{ ...atomicUpdateConfigFor(javascriptLayout), ...parser }],
  { preset: 'javascript' },
);

function messages(code, entries = config, filename = 'src/main/update.ts') {
  return new Linter()
    .verify(code, entries, { filename })
    .map(({ ruleId, messageId }) => ({ ruleId, messageId }));
}

const propertyUpdate = 'export async function update(state, load) { state.total += await load(); }';
const thisUpdate = 'export class Store { async add(load) { this.total += await load(); } }';

describe('atomic updates', () => {
  it.each([
    ['property', propertyUpdate, 'nonAtomicObjectUpdate'],
    [
      'shared binding',
      'let total = 0; export async function update(load) { total += await load(); }',
      'nonAtomicUpdate',
    ],
    [
      'saved read',
      'export async function update(state, load) { const previous = state.total; const delta = await load(); state.total = previous + delta; }',
      'nonAtomicObjectUpdate',
    ],
    [
      'property of an alias-free parameter chain',
      'export async function update(state, load) { state.stats.total = state.stats.total + (await load()); }',
      'nonAtomicObjectUpdate',
    ],
  ])('reports a stale %s', (_name, code, messageId) => {
    expect(messages(code)).toEqual([{ ruleId: rule, messageId }]);
  });

  it.each([
    [
      'local binding',
      'export async function update(load) { let total = 0; total += await load(); return total; }',
    ],
    [
      'local object',
      'export async function update(load) { const state = { total: 0 }; state.total += await load(); return state; }',
    ],
    [
      'await before read',
      'export async function update(state, load) { const delta = await load(); state.total += delta; }',
    ],
    ['no suspension', 'export function update(state, delta) { state.total += delta; }'],
    [
      'in-place mutation',
      'export async function update(state, load) { state.items.push(await load()); }',
    ],
  ])('allows %s', (_name, code) => {
    expect(messages(code)).toEqual([]);
  });

  it.each([
    [
      'a saved binding',
      'let total = 0; export async function update(load) { const current = total; const delta = await load(); total = current + delta; }',
      'nonAtomicUpdate',
    ],
    [
      'a saved local changed in place',
      'let total = 0; export async function update(load) { let current = total; current += await load(); total = current; }',
      'nonAtomicUpdate',
    ],
    [
      'a property read through an alias',
      'export async function update(state, load) { const view = state; const delta = await load(); state.total = view.total + delta; }',
      'nonAtomicObjectUpdate',
    ],
    [
      'a destructured property',
      'export async function update(state, load) { const { total } = state; const delta = await load(); state.total = total + delta; }',
      'nonAtomicObjectUpdate',
    ],
    [
      'a spread of the written array',
      'export async function update(state, load) { const before = state.items; const item = await load(); state.items = [...before, item]; }',
      'nonAtomicObjectUpdate',
    ],
    [
      'a lazy initialization written as an operator',
      'let cached; export async function get(load) { cached ??= await load(); return cached; }',
      'nonAtomicUpdate',
    ],
  ])('still reports %s', (_name, code, messageId) => {
    expect(messages(code)).toEqual([{ ruleId: rule, messageId }]);
  });

  it.each([
    [
      'a property awaited into a local first',
      'export async function update(req, verify) { const user = await verify(req.headers.token); req.user = user; }',
    ],
    [
      'a property written from another property',
      'export async function update(order, load) { const id = order.id; const items = await load(id); order.items = items; }',
    ],
    [
      'a destructured other property',
      'export async function update(order, load) { const { id } = order; const items = await load(id); order.items = items; }',
    ],
    [
      'a binding awaited into a local first',
      'let total = 0; export async function update(load) { const delta = await load(); total = delta; }',
    ],
    [
      'a checked lazy initialization',
      'let cached; export async function get(load) { if (cached === undefined) { const value = await load(); cached = value; } return cached; }',
    ],
    [
      'a checked lazy initialization assigned directly',
      'let cached; export async function get(load) { if (cached === undefined) { cached = await load(); } return cached; }',
    ],
  ])('allows the advised local-first form: %s', (_name, code) => {
    expect(messages(code)).toEqual([]);
  });

  it('does not recognize a lock around the update', () => {
    const locked =
      'export async function update(state, mutex, load) { await mutex.runExclusive(async () => { state.total += await load(); }); }';
    expect(messages(locked)).toEqual([{ ruleId: rule, messageId: 'nonAtomicObjectUpdate' }]);
  });

  it('reports the same shapes in test files', () => {
    expect(messages(propertyUpdate, config, 'test/update.test.ts')).toEqual([
      { ruleId: rule, messageId: 'nonAtomicObjectUpdate' },
    ]);
    expect(messages(propertyUpdate, config, 'src/update.test.ts')).toEqual([
      { ruleId: rule, messageId: 'nonAtomicObjectUpdate' },
    ]);
  });

  it('keeps property checks in the JavaScript dialect', () => {
    expect(messages(propertyUpdate, javascriptConfig, 'src/main/update.js')).toEqual([
      { ruleId: rule, messageId: 'nonAtomicObjectUpdate' },
    ]);
  });

  it('records the upstream blind spot for this', () => {
    expect(messages(thisUpdate)).toEqual([]);
  });

  it('records the upstream local-alias blind spot', () => {
    expect(
      messages(
        'export async function update(state, load) { const alias = state; alias.total += await load(); }',
      ),
    ).toEqual([]);
  });

  it('honors only the reviewed exception paths', () => {
    const entries = applyRuleExceptions(config, [
      { rule, paths: ['src/main/serialized.ts'], reason: 'Caller owns an exclusive lock.' },
    ]);
    expect(messages(propertyUpdate, entries, 'src/main/serialized.ts')).toEqual([]);
    expect(messages(propertyUpdate, entries)).toEqual([
      { ruleId: rule, messageId: 'nonAtomicObjectUpdate' },
    ]);
  });

  it('retains the upstream allowProperties option', () => {
    expect(
      messages(propertyUpdate, [
        { ...config[0], rules: { [rule]: ['error', { allowProperties: true }] } },
      ]),
    ).toEqual([]);
  });

  it('explains the mechanism, the remediation and the exception route', () => {
    const text =
      'Possible race condition: `state.total` might be assigned based on an outdated state of `state`.';
    const message = routedEslintMessage({ ruleId: rule, text, relativePath: 'src/main/update.ts' });
    expect(message).toBe(
      `${text} Another call can change it during the \`await\`, and this write then overwrites that change. ` +
        'Await the new value into a local first and then read and write the shared state in one step with no ' +
        '`await` between them (`const delta = await load(); state.total += delta;`). A lock or a queue around ' +
        'the update is not recognized: when the state is already serialized or confined to one task, add a ' +
        'reviewed exception. If this is intended, add ' +
        '{"rule":"nitpicker/require-atomic-updates","paths":["src/main/update.ts"],"reason":"..."} to ' +
        '"exceptions" in nitpicker.config.json.',
    );
  });
});
