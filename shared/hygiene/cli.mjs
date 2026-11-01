import { readHeadPolicyFile } from '../head-policy.mjs';
import { TROUBLESHOOTING_ANCHORS, withTroubleshooting } from '../messages/troubleshooting.mjs';
import { describeError } from '../messages/error-chain.mjs';

const OPTION_NAMES = {
  '--check': 'check',
  '--project-root': 'projectRoot',
  '--history-ref': 'historyRef',
};

export function parseCheckArguments(commandArguments, label = 'hygiene') {
  const options = {};
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

export function runCheckCli({ commandArguments, stdout, stderr, environment, runCheck, label }) {
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
