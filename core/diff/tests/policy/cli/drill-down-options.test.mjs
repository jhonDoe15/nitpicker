import { describe, expect, it } from 'vitest';
import { parseDrillDownOptions } from '../../../comparison/cli.mjs';

describe('quality diff command-line options', () => {
  it('separates repeatable drill-down flags from the arguments resolveBaseRef sees', () => {
    expect(
      parseDrillDownOptions([
        '--analyzer',
        'eslint-lint',
        '--base',
        'origin/master',
        '--rule',
        'no-explicit-any',
        '--analyzer',
        'entry-points',
      ]),
    ).toEqual({
      analyzerNames: ['eslint-lint', 'entry-points'],
      ruleFilters: ['no-explicit-any'],
      shardCount: undefined,
      shardIndex: undefined,
      deferExit: false,
      remainingArguments: ['--base', 'origin/master'],
    });
  });
  it('parses complete shard coordinates and deferred worker exits', () => {
    expect(
      parseDrillDownOptions([
        '--base',
        'origin/master',
        '--shard-count',
        '3',
        '--shard-index',
        '1',
        '--defer-exit',
      ]),
    ).toEqual({
      analyzerNames: [],
      ruleFilters: [],
      shardCount: 3,
      shardIndex: 1,
      deferExit: true,
      remainingArguments: ['--base', 'origin/master'],
    });
  });
  it('requires complete shard coordinates and rejects explicit analyzer overlap', () => {
    expect(() => parseDrillDownOptions(['--shard-count', '3'])).toThrow(
      /shard-count and --shard-index must be provided together/,
    );
    expect(() =>
      parseDrillDownOptions(['--analyzer', 'coverage', '--shard-count', '3', '--shard-index', '0']),
    ).toThrow(/--analyzer cannot be combined/);
  });
  it('requires a value for analyzer, rule, and shard flags', () => {
    expect(() => parseDrillDownOptions(['--analyzer'])).toThrow(/--analyzer requires a value/);
    expect(() => parseDrillDownOptions(['--rule'])).toThrow(/--rule requires a value/);
    expect(() => parseDrillDownOptions(['--shard-count'])).toThrow(
      /--shard-count requires a value/,
    );
  });
});
