import { Linter } from 'eslint';
import { applyJavascriptDialect } from '../../../../javascript/preset/eslint-dialect.mjs';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { applyRuleExceptions } from '../exceptions.mjs';
import { eslintMessageWithHint } from '../../../adapters/hints/eslint-hints.mjs';

const rule = 'require-atomic-updates';
const config = [
  {
    files: ['**/*.{ts,js}'],
    languageOptions: { parser: tseslint.parser },
    rules: { [rule]: ['error', { allowProperties: false }] },
  },
];

function messages(code, entries = config, filename = 'src/update.ts') {
  return new Linter()
    .verify(code, entries, { filename })
    .map(({ ruleId, messageId }) => ({ ruleId, messageId }));
}

const propertyUpdate = 'export async function update(state, load) { state.total += await load(); }';

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
  ])('allows %s', (_name, code) => {
    expect(messages(code)).toEqual([]);
  });

  it('keeps property checks in the JavaScript dialect', () => {
    const entries = applyJavascriptDialect(config, { preset: 'javascript' });
    expect(messages(propertyUpdate, entries, 'src/update.js')).toEqual([
      { ruleId: rule, messageId: 'nonAtomicObjectUpdate' },
    ]);
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
      { rule, paths: ['src/serialized.ts'], reason: 'Caller owns an exclusive lock.' },
    ]);
    expect(messages(propertyUpdate, entries, 'src/serialized.ts')).toEqual([]);
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

  it('explains remediation and the exception route', () => {
    expect(
      eslintMessageWithHint({
        ruleId: rule,
        text: 'Possible race condition.',
        relativePath: 'src/update.ts',
      }),
    ).toBe(
      'Possible race condition. Await the new value before reading shared state, or serialize the whole read/modify/write operation. If access is already serialized, add an exception for this rule in nitpicker.config.json.',
    );
  });
});
