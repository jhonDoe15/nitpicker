import { describe, expect, it } from 'vitest';
import { failingTestEntries, valuesInMessage } from './failing-tests.mjs';

describe('failing test entries', () => {
  it('cut a long value without splitting a character', () => {
    const value = `${'a'.repeat(199)}😀😀`;

    expect(failingTestEntries([{ name: 't', expected: value, received: 'b' }])).toEqual([
      '  t',
      `    expected: ${'a'.repeat(199)}😀…`,
      '    received: b',
    ]);
  });

  it('cut a long message', () => {
    expect(failingTestEntries([{ name: 't', message: 'm'.repeat(250) }])).toEqual([
      `  t: ${'m'.repeat(200)}…`,
    ]);
  });

  it('leave out the values the message already shows', () => {
    expect(
      failingTestEntries([
        { file: 'a.py', line: 3, name: 't', message: '3 != 4', expected: '4', received: '3' },
      ]),
    ).toEqual(['  a.py:3 > t: 3 != 4']);
  });
});

describe('values in a message', () => {
  it.each([
    ['JUnit', 'expected: <4> but was: <3>'],
    ['AssertJ', '\nExpecting actual:\n  3\nto be equal to:\n  4\nbut was not.'],
    ['Jest', 'Expected: 4\nReceived: 3'],
    ['Hamcrest', 'Expected: 4\n     but: 3'],
    ['kotlin.test', 'Expected <4>, actual <3>.'],
    ['testify', 'expected: 4\nactual  : 3'],
  ])('reads the %s form', (_, message) => {
    expect(valuesInMessage(message)).toEqual({ expected: '4', received: '3' });
  });

  it('reads nothing from a message without values', () => {
    expect(valuesInMessage('boom')).toEqual({});
  });
});
