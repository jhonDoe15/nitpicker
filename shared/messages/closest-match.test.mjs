import { describe, expect, it } from 'vitest';
import { closestMatch, didYouMean, suggestionOrAllowed } from './closest-match.mjs';

const FLAGS = [
  '--all',
  '--fix',
  '--help',
  '--no-cache',
  '--base',
  '--output',
  '--analyzer',
  '--rule',
];

describe('closestMatch', () => {
  it.each([
    ['--analyser', '--analyzer'],
    ['--anaylzer', '--analyzer'],
    ['--rul', '--rule'],
    ['-base', '--base'],
    ['fix', '--fix'],
    ['--Output', '--output'],
    ['--no-cahce', '--no-cache'],
  ])('suggests %s -> %s', (input, expected) => {
    expect(closestMatch(input, FLAGS)).toBe(expected);
  });

  it('ignores an inline value', () => {
    expect(closestMatch('--anaylzer=eslint-lint', FLAGS)).toBe('--analyzer');
  });

  it('never suggests a word with another first letter, such as exclude for include', () => {
    expect(closestMatch('include', ['exclude', 'preset'])).toBeUndefined();
  });

  it.each(['--verbose', '--quiet', 'foo', '-h', '--base-ref-name'])(
    'suggests nothing for the unrelated %s',
    (input) => {
      expect(closestMatch(input, FLAGS)).toBeUndefined();
    },
  );

  it('picks the first candidate on a tie', () => {
    expect(closestMatch('cat', ['cut', 'cot'])).toBe('cut');
  });
});

describe('didYouMean', () => {
  it('quotes the suggestion, or says nothing without one', () => {
    expect([didYouMean('presets', ['base', 'preset']), didYouMean('colour', ['base'])]).toEqual([
      '. Did you mean "preset"?',
      '',
    ]);
  });

  it('can leave the suggestion unquoted', () => {
    expect(didYouMean('caches', ['cache'], '')).toBe('. Did you mean cache?');
  });
});

describe('suggestionOrAllowed', () => {
  it('lists the allowed names only when nothing is close', () => {
    expect([
      suggestionOrAllowed('presets', ['base', 'preset']),
      suggestionOrAllowed('colour', ['base', 'preset']),
      suggestionOrAllowed('colour', ['base'], 'Allowed thresholds'),
    ]).toEqual([
      '. Did you mean "preset"?',
      '. Allowed keys: base, preset',
      '. Allowed thresholds: base',
    ]);
  });
});
