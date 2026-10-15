import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

export function parseHygieneArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = OPTION_NAMES[arguments_[index]];
    if (name === undefined || arguments_[index + 1] === undefined) {
      throw new Error(`Invalid hygiene argument: ${arguments_[index]}`);
    }
    options[name] = arguments_[index + 1];
  }
  return options;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseHygieneArguments(process.argv.slice(2));
    const findings = runHygieneCheck({ ...options, policy: readHeadPolicyFile() });
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (error) {
    process.stderr.write(
      `Hygiene check failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
