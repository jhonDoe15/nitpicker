import { readHeadPolicyFile } from '../head-policy.mjs';
import { REPOSITORY_HYGIENE_TOOL, collectRepositoryFindings } from './files/repository-files.mjs';
import { withoutExcepted, withoutExcluded } from './rules.mjs';
import { trackedFiles } from './tracked-files.mjs';

const CHECKS = {
  [REPOSITORY_HYGIENE_TOOL]: collectRepositoryFindings,
};
const OPTION_NAMES = {
  '--check': 'check',
  '--project-root': 'projectRoot',
};

export function runHygieneCheck({ check, projectRoot, policy = {} }) {
  const collect = CHECKS[check];
  if (collect === undefined) {
    throw new Error(`Unknown hygiene check: ${check}`);
  }
  const files = withoutExcluded(trackedFiles(projectRoot), policy.exclude);
  return withoutExcepted(collect({ projectRoot, files }), policy.exceptions);
}

export function parseHygieneArguments(commandArguments) {
  const options = {};
  for (const [index, flag] of commandArguments.entries()) {
    if (index % 2 === 1) {
      continue;
    }
    const name = OPTION_NAMES[flag];
    const value = commandArguments[index + 1];
    if (name === undefined || value === undefined) {
      throw new Error(`Invalid hygiene argument: ${flag}`);
    }
    options[name] = value;
  }
  return options;
}

export function runHygieneCli({ commandArguments, stdout, stderr, environment }) {
  try {
    const options = parseHygieneArguments(commandArguments);
    const findings = runHygieneCheck({ ...options, policy: readHeadPolicyFile(environment) });
    stdout.write(`${JSON.stringify({ findings })}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `Hygiene check failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}
