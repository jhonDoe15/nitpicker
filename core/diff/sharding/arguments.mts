import { takeOptionValue, unknownArgumentError } from '../comparison/cli.mts';

type OptionValues = {
  readonly values: Partial<Record<string, string>>;
  readonly details: boolean;
};

export type ParsedArguments =
  | { readonly kind: 'help' }
  | {
      readonly kind: 'run';
      readonly inputRoot: string;
      readonly outputRoot: string | undefined;
      readonly shardCount: number;
      readonly policyRoot: string | undefined;
      readonly details: boolean;
    };

const OPTION_NAMES = ['--input-root', '--output', '--shard-count', '--policy-root'];
const HELP = '--help';

export const AGGREGATE_OPTIONS = [...OPTION_NAMES, '--details', HELP];

function collectOptionValues(commandArguments: readonly string[]): OptionValues | undefined {
  const values: Partial<Record<string, string>> = {};
  let details = false;
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    if (argument === HELP) {
      return undefined;
    }
    if (argument === '--details') {
      details = true;
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
  return { values, details };
}

export function parseArguments(commandArguments: readonly string[]): ParsedArguments {
  const options = collectOptionValues(commandArguments);
  if (options === undefined) {
    return { kind: 'help' };
  }
  const { values, details } = options;
  const inputRoot = values['--input-root'];
  if (inputRoot === undefined) {
    throw new Error('--input-root is required');
  }
  const shardCount = values['--shard-count'];
  if (shardCount === undefined) {
    throw new Error('--shard-count is required');
  }
  return {
    kind: 'run',
    inputRoot,
    outputRoot: values['--output'],
    shardCount: Number(shardCount),
    policyRoot: values['--policy-root'],
    details,
  };
}
