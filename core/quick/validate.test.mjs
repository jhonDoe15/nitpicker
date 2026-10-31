import { describe, expect, it } from 'vitest';
import { parseArguments, USAGE_TEXT } from '../command/arguments.mjs';

const DEFAULTS = {
  all: false,
  fix: false,
  help: false,
  cache: true,
  quick: false,
  staged: false,
  analyzerNames: [],
  ruleFilters: [],
  deferExit: false,
};

describe('--quick and --staged arguments', () => {
  it('parses both flags and defaults them to off', () => {
    expect(parseArguments([])).toEqual(DEFAULTS);
    expect(parseArguments(['--quick', '--staged'])).toEqual({
      ...DEFAULTS,
      quick: true,
      staged: true,
    });
  });

  it('combines with --analyzer, --base, --fix (quick) and --all', () => {
    expect(
      parseArguments(['--quick', '--analyzer', 'structure', '--base', 'main', '--fix']),
    ).toEqual({
      ...DEFAULTS,
      quick: true,
      fix: true,
      baseRef: 'main',
      analyzerNames: ['structure'],
    });
    expect(parseArguments(['--quick', '--all'])).toEqual({ ...DEFAULTS, quick: true, all: true });
    expect(parseArguments(['--staged', '--all'])).toEqual({ ...DEFAULTS, staged: true, all: true });
  });

  it('refuses --quick with sharding', () => {
    expect(() => parseArguments(['--quick', '--shard-count', '2', '--shard-index', '0'])).toThrow(
      '--quick cannot be combined with --shard-count or --shard-index: a sharded run is the full gate split across jobs, and a quick run is fast enough for one process.',
    );
  });

  it('refuses --staged with --fix and says what to do', () => {
    expect(() => parseArguments(['--staged', '--fix'])).toThrow(
      '--staged cannot be combined with --fix: the fixes land in the working tree, not in the index. Run nitpicker --fix first, stage the changes, then run nitpicker --staged.',
    );
  });

  it('lists both flags in the usage text', () => {
    expect(USAGE_TEXT.split('\n')[0]).toBe(
      'Usage: nitpicker [--base <ref>] [--output <dir>] [--all | --fix] [--analyzer <name>]... [--rule <substring>]... [--quick] [--staged] [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache] [--accept-policy-change=<digest>] [--help]',
    );
  });
});
