import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../../languages/typescript/preset/failure-messages/harness.mjs';
import { strictTestsConfig } from '../../languages/typescript/preset/eslint-config/strict-tests.mjs';
import { detectCodeShortcuts } from './code-shortcuts.mjs';

const testFile = 'test/a.test.ts';

function shortcutsFor(code) {
  return detectCodeShortcuts({ fixture: {}, final: { [testFile]: code } });
}

function gateMessagesFor(code) {
  return failureMessagesFor({ config: strictTestsConfig, filename: testFile, code });
}

describe('the gate and the code-shortcuts detector agree on test files', () => {
  it.each([
    'for (let index = 0; index < 3; index += 1) { run(index); }',
    'for (const key in table) { run(key); }',
    'while (more()) { step(); }',
    'do { step(); } while (more());',
    'cases.forEach(run);',
    'run().then(check);',
    'export const name = lookup() as string;',
    'export const name = <string>lookup();',
  ])('both report %s', (code) => {
    expect(shortcutsFor(code)).not.toEqual([]);
    expect(gateMessagesFor(code)).not.toEqual([]);
  });

  it.each([
    'for (const item of items) { run(item); }',
    "it('x', async () => { await run(); });",
    "export const modes = ['a', 'b'] as const;",
  ])('neither reports %s', (code) => {
    expect(shortcutsFor(code)).toEqual([]);
    expect(gateMessagesFor(code)).toEqual([]);
  });
});
