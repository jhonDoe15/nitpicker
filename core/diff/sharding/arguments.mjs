import { takeOptionValue, unknownArgumentError } from '../comparison/cli.mjs';

const OPTION_NAMES = ['--input-root', '--output', '--shard-count', '--policy-root'];
const HELP = '--help';

export const AGGREGATE_OPTIONS = [...OPTION_NAMES, '--details', HELP];

function collectOptionValues(arguments_) {
  const values = {};
  const remaining = arguments_.values();
  for (const argument of remaining) {
    if (argument === HELP) {
      return undefined;
    }
    if (argument === '--details') {
      values[argument] = true;
      continue;
    }
    if (!OPTION_NAMES.includes(argument)) {
      throw unknownArgumentError(
        argument,
        AGGREGATE_OPTIONS,
        'Run nitpicker aggregate --help for the options.',
      );
    }
    values[argument] = takeOptionValue(remaining, argument);
  }
  return values;
}

export function parseArguments(arguments_) {
  const values = collectOptionValues(arguments_);
  if (values === undefined) {
    return { kind: 'help' };
  }
  if (values['--input-root'] === undefined) {
    throw new Error('--input-root is required');
  }
  if (values['--shard-count'] === undefined) {
    throw new Error('--shard-count is required');
  }
  return {
    kind: 'run',
    inputRoot: values['--input-root'],
    outputRoot: values['--output'],
    shardCount: Number(values['--shard-count']),
    policyRoot: values['--policy-root'],
    details: values['--details'] === true,
  };
}
