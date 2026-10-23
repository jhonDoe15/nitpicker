import { takeOptionValue } from '../comparison/cli.mjs';
import { usageError } from '../../../shared/messages/troubleshooting.mjs';

const OPTION_NAMES = ['--input-root', '--output', '--shard-count', '--policy-root'];

function collectOptionValues(arguments_) {
  const values = {};
  const remaining = arguments_.values();
  for (const argument of remaining) {
    if (argument === '--help') {
      return undefined;
    }
    if (!OPTION_NAMES.includes(argument)) {
      throw usageError(`Unknown argument: ${argument}`);
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
    throw usageError('--input-root is required');
  }
  if (values['--shard-count'] === undefined) {
    throw usageError('--shard-count is required');
  }
  return {
    kind: 'run',
    inputRoot: values['--input-root'],
    outputRoot: values['--output'],
    shardCount: Number(values['--shard-count']),
    policyRoot: values['--policy-root'],
  };
}
