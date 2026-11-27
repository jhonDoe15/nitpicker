import { describe, expect, it } from 'vitest';
import { ALL_ERRORS_AS_WARNINGS, checkLevels, type CheckLevels } from './check-levels.mts';
import { narrowedFlags } from './narrowed-flags.mts';
import { lombokOff, runnerLevels } from './runner-levels.mts';

const SHOWN = [
  'FallThrough',
  'AnnotationPosition',
  'Immutable',
  'ImmutableEnumChecker',
  'SystemOut',
  'UnicodeDirectionalityCharacters',
  'RequireExplicitNullMarking',
  'FormatString',
  'FloggerFormatString',
];

function shown(levels: CheckLevels | undefined): Record<string, string | undefined> | undefined {
  return levels === undefined
    ? undefined
    : Object.fromEntries(
        SHOWN.flatMap((check) => (levels.has(check) ? [[check, levels.get(check)]] : [])),
      );
}

const DEFAULTS = {
  FallThrough: 'WARNING',
  Immutable: 'ERROR',
  ImmutableEnumChecker: 'WARNING',
  UnicodeDirectionalityCharacters: 'ERROR',
  RequireExplicitNullMarking: 'SUGGESTION',
  FormatString: 'ERROR',
  FloggerFormatString: 'ERROR',
};

describe('checkLevels', () => {
  it.each([
    [[], 499, DEFAULTS],
    [
      ['-Xep:Immutable:OFF'],
      496,
      { ...DEFAULTS, Immutable: undefined, ImmutableEnumChecker: undefined },
    ],
    [
      ['-Xep:FormatString:OFF'],
      497,
      { ...DEFAULTS, FormatString: undefined, FloggerFormatString: undefined },
    ],
    [
      ['-Xep:SystemOut:ERROR', ALL_ERRORS_AS_WARNINGS],
      500,
      {
        ...DEFAULTS,
        Immutable: 'WARNING',
        SystemOut: 'WARNING',
        FormatString: 'WARNING',
        FloggerFormatString: 'WARNING',
      },
    ],
    [
      [ALL_ERRORS_AS_WARNINGS, '-Xep:SystemOut:ERROR'],
      500,
      {
        ...DEFAULTS,
        Immutable: 'WARNING',
        SystemOut: 'ERROR',
        FormatString: 'WARNING',
        FloggerFormatString: 'WARNING',
      },
    ],
    [
      ['-Xep:AnnotationPosition:WARN', '-XepDisableAllChecks'],
      1,
      { UnicodeDirectionalityCharacters: 'ERROR' },
    ],
    [
      ['-Xep:FallThrough:OFF', '-XepAllDisabledChecksAsWarnings'],
      644,
      { ...DEFAULTS, AnnotationPosition: 'WARNING', SystemOut: 'WARNING' },
    ],
    [
      ['-XepDisableAllWarnings'],
      188,
      { ...DEFAULTS, FallThrough: undefined, ImmutableEnumChecker: undefined },
    ],
    [['-XepAllSuggestionsAsWarnings'], 499, { ...DEFAULTS, RequireExplicitNullMarking: 'WARNING' }],
  ])('gives what Error Prone 2.50.0 runs for %j', (flags, count, expected) => {
    const levels = checkLevels(flags);

    expect(levels?.size).toBe(count);
    expect(shown(levels)).toStrictEqual(
      Object.fromEntries(Object.entries(expected).filter(([, level]) => level !== undefined)),
    );
  });

  it('is undefined where Error Prone refuses the flags', () => {
    expect(checkLevels(['-Xep:UnicodeDirectionalityCharacters:OFF'])).toBeUndefined();
    expect(checkLevels(['-Xep:UnicodeDirectionalityCharacters:WARN'])).toBeUndefined();
    expect(checkLevels(['-Xep:NotACheck:OFF'])?.size).toBe(499);
  });
});

describe('runnerLevels', () => {
  const head = [
    '--errorprone-flag=-Xep:MissingSummary:WARN',
    '--errorprone-flag=-XepNitpickerFixChecks:/fix',
  ];

  it('runs the runner list, NullAway off without own classes, and lets later project levels win', () => {
    const levels = runnerLevels(head, { lombokUnsuppressed: true, immutableInReach: false });

    expect(levels?.has('AnnotationPosition')).toBe(true);
    expect(levels?.has('NullAway')).toBe(false);
    expect(levels?.has('ImmutableEnumChecker')).toBe(false);
    expect(levels?.get('MissingSummary')).toBe('WARNING');
    expect(lombokOff(head, true)).toStrictEqual([
      'MissingBraces',
      'MultiVariableDeclaration',
      'StatementSwitchToExpressionSwitch',
      'StringConcatToTextBlock',
      'UnnecessarilyFullyQualified',
      'UnrecognisedJavadocTag',
    ]);
  });
});

describe('narrowedFlags', () => {
  it('keeps the planned checks at their levels when a name turns off more than one check', () => {
    const wanted =
      runnerLevels([], { lombokUnsuppressed: false, immutableInReach: true }) ?? new Map();
    const flags = narrowedFlags([], ['FloggerFormatString', 'ImmutableEnumChecker'], wanted);
    const levels = runnerLevels([], { lombokUnsuppressed: false, immutableInReach: true }, flags);

    expect([...(levels ?? new Map())]).toStrictEqual([
      ['FloggerFormatString', 'WARNING'],
      ['ImmutableEnumChecker', 'WARNING'],
      ['UnicodeDirectionalityCharacters', 'ERROR'],
    ]);
  });

  it('refuses a plan Error Prone cannot run', () => {
    const levels = new Map([['UnicodeDirectionalityCharacters', 'WARNING' as const]]);

    expect(() => narrowedFlags([], ['UnicodeDirectionalityCharacters'], levels)).toThrow(
      'a narrowed Error Prone run cannot keep only the planned checks',
    );
  });
});
