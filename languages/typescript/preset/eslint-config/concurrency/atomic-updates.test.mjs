import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { applyJavascriptDialect } from '../../../../javascript/preset/eslint-dialect.mjs';
import { routedEslintMessage } from '../../../adapters/hints/eslint-hints.mjs';
import { defaultResolvedLayout, resolveLayout } from '../../layout.mjs';
import { applyRuleExceptions } from '../exceptions.mjs';
import { atomicUpdateConfigFor } from './atomic-updates.mjs';

const rule = 'require-atomic-updates';
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
        'Await the new value into a local first and read and write the shared state in one step with no ' +
        '`await` between them, or serialize the whole operation with a lock or a queue. If this is intended, ' +
        'add {"rule":"require-atomic-updates","paths":["src/main/update.ts"],"reason":"..."} to "exceptions" ' +
        'in nitpicker.config.json.',
    );
  });
});
