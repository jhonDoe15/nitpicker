import { describe, expect, it } from 'vitest';
import { parseArguments } from '../command/arguments.mjs';
import { usageText } from '../help/usage-text.mjs';

const DEFAULTS = {
  all: false,
  details: false,
  json: false,
  fix: false,
  help: false,
  version: false,
  cache: true,
  quick: false,
  staged: false,
  analyzerNames: [],
  ruleFilters: [],
  deferExit: false,
  paths: [],
  shardCount: undefined,
  shardIndex: undefined,
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
    const text = usageText({ analyzers: { preset: 'typescript', names: [] } });
    const flagged = text.split('\n').filter((line) => /--(?:quick|staged)\b/u.test(line));

    expect(flagged.map((line) => line.trim().split(/\s{2,}/u)[0])).toEqual([
      '[--rule <substring>]... [--details] [--json] [--quick] [--staged]',
      '--quick',
      '--staged',
    ]);
  });
});
