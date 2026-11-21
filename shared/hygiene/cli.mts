import { readHeadPolicyFile } from '../head-policy.mts';
import { TROUBLESHOOTING_ANCHORS, withTroubleshooting } from '../messages/troubleshooting.mts';
import { describeError } from '../messages/error-chain.mts';
import type { CheckArguments, CheckCliInput } from './check-types.mts';

const OPTION_NAMES: Readonly<Record<string, keyof CheckArguments>> = {
  '--check': 'check',
  '--project-root': 'projectRoot',
  '--history-ref': 'historyRef',
  '--baseline-root': 'baselineRoot',
};

export function parseCheckArguments(
  commandArguments: readonly string[],
  label = 'hygiene',
): CheckArguments {
  const options: CheckArguments = {};
  for (const [index, flag] of commandArguments.entries()) {
    if (index % 2 === 1) {
      continue;
    }
    const name = OPTION_NAMES[flag];
    const value = commandArguments[index + 1];
    if (name === undefined || value === undefined) {
      throw new Error(`Invalid ${label} argument: ${flag}`);
    }
    options[name] = value;
  }
  return options;
}

export function runCheckCli({
  commandArguments,
  stdout,
  stderr,
  environment,
  runCheck,
  label,
}: CheckCliInput): number {
  try {
    const options = parseCheckArguments(commandArguments, label.toLowerCase());
    const findings = runCheck({ ...options, policy: readHeadPolicyFile(environment) });
    stdout.write(`${JSON.stringify({ findings })}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `${withTroubleshooting(`${label} check failed: ${describeError(error)}`, TROUBLESHOOTING_ANCHORS.analyzerCrashed)}\n`,
    );
    return 2;
  }
}
