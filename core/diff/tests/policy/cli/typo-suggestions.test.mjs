import { describe, expect, it } from 'vitest';
import { parseArguments } from '../../../../command/arguments.mjs';
import { runBaseCommand } from '../../../../command/base.mjs';
import { runCacheCommand } from '../../../../command/cache.mjs';
import { parseArguments as parseAggregateArguments } from '../../../sharding/arguments.mjs';

const HELP = 'Run nitpicker --help for the options.';
const CACHE_USAGE =
  'Usage: nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]';

describe('argument typos', () => {
  it.each([
    [
      ['--analyser', 'eslint-lint'],
      `Unknown argument: --analyser. Did you mean --analyzer? ${HELP}`,
    ],
    [['--defer-exits'], `Unknown argument: --defer-exits. Did you mean --defer-exit? ${HELP}`],
    [['caches'], `Unknown argument: caches. Did you mean cache? ${HELP}`],
    [['agregate'], `Unknown argument: agregate. Did you mean aggregate? ${HELP}`],
    [['all'], `Unknown argument: all. Did you mean --all? ${HELP}`],
    [['--verbose'], `Unknown argument: --verbose. ${HELP}`],
    [['--cache'], `Unknown argument: --cache. ${HELP}`],
    [
      ['--fix', 'base'],
      `Unknown argument: base. A subcommand goes first, as in nitpicker base. ${HELP}`,
    ],
    [['report'], `Unknown argument: report. ${HELP}`],
  ])('names the closest option for %j', (arguments_, message) => {
    expect(() => parseArguments(arguments_)).toThrow(message);
  });

  it('suggests the aggregate options', () => {
    expect(() => parseAggregateArguments(['--input-rot', 'reports'])).toThrow(
      'Unknown argument: --input-rot. Did you mean --input-root? Run nitpicker aggregate --help for the options.',
    );
    expect(() => parseAggregateArguments(['--verbose'])).toThrow(
      'Unknown argument: --verbose. Run nitpicker aggregate --help for the options.',
    );
  });

  it('suggests the cache subcommand and its options', () => {
    expect(() => runCacheCommand({ arguments_: ['publsh'] })).toThrow(
      `Unknown cache command: publsh. Did you mean publish? ${CACHE_USAGE}`,
    );
    expect(() => runCacheCommand({ arguments_: ['clear'] })).toThrow(
      `Unknown cache command: clear. ${CACHE_USAGE}`,
    );
    expect(() => runCacheCommand({ arguments_: ['publish', '--analyser'] })).toThrow(
      `Unknown argument: --analyser. Did you mean --analyzer? ${CACHE_USAGE}`,
    );
    expect(() => runCacheCommand({ arguments_: [] })).toThrow(CACHE_USAGE);
  });

  it('suggests --base for the base subcommand', () => {
    expect(() => runBaseCommand({ arguments_: ['--bas', 'main'] })).toThrow(
      'Unknown argument: --bas. Did you mean --base? Usage: nitpicker base [--base <ref>]',
    );
  });
});
