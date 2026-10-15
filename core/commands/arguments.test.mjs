import { describe, expect, it } from 'vitest';
import { parseArguments } from './arguments.mjs';

const defaults = {
  all: false,
  fix: false,
  baseRef: undefined,
  outputRoot: undefined,
  analyzerNames: [],
  ruleFilters: [],
  shardCount: undefined,
  shardIndex: undefined,
  deferExit: false,
  cache: true,
  help: false,
};

describe('parseArguments', () => {
  it('returns the defaults without arguments', () => {
    expect(parseArguments([])).toEqual(defaults);
  });

  it('reads flags and options with values', () => {
    const parsed = parseArguments([
      '--fix',
      '--no-cache',
      '--help',
      '--base',
      'origin/main',
      '--output',
      'out',
      '--analyzer',
      'structure',
    ]);

    expect(parsed).toEqual({
      ...defaults,
      fix: true,
      cache: false,
      help: true,
      baseRef: 'origin/main',
      outputRoot: 'out',
      analyzerNames: ['structure'],
    });
  });

  it('reads --all', () => {
    expect(parseArguments(['--all'])).toEqual({ ...defaults, all: true });
  });

  it('requires a value after --base and --output', () => {
    expect(() => parseArguments(['--base'])).toThrow(new Error('--base requires a value'));
    expect(() => parseArguments(['--output', '--fix'])).toThrow(
      new Error('--output requires a value'),
    );
  });

  it('rejects an unknown argument', () => {
    expect(() => parseArguments(['--nope'])).toThrow(new Error('Unknown argument: --nope'));
  });

  it('rejects what --all cannot be combined with', () => {
    expect(() => parseArguments(['--all', '--fix'])).toThrow(
      new Error('--fix cannot be combined with --all'),
    );
    expect(() => parseArguments(['--all', '--base', 'main'])).toThrow(
      new Error('--all cannot be combined with --base'),
    );
    expect(() => parseArguments(['--all', '--shard-count', '2', '--shard-index', '0'])).toThrow(
      new Error('--all cannot be combined with --shard-count or --shard-index'),
    );
    expect(() => parseArguments(['--all', '--defer-exit'])).toThrow(
      new Error('--all cannot be combined with --defer-exit'),
    );
  });

  it('accepts the options --all is not combined with on their own', () => {
    expect(parseArguments(['--fix', '--base', 'main', '--defer-exit'])).toEqual({
      ...defaults,
      fix: true,
      baseRef: 'main',
      deferExit: true,
    });
  });
});
