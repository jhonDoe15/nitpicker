import { REPOSITORY_HYGIENE_TOOL, collectRepositoryFindings } from './files/repository-files.mjs';
import { runCheckCli } from './cli.mjs';
import { withoutExcepted, withoutExcluded } from './rules.mjs';
import { trackedFiles } from './tracked-files.mjs';

const CHECKS = {
  [REPOSITORY_HYGIENE_TOOL]: collectRepositoryFindings,
};

export function runHygieneCheck({ check, projectRoot, policy = {} }) {
  const collect = CHECKS[check];
  if (collect === undefined) {
    throw new Error(`Unknown hygiene check: ${check}`);
  }
  const files = withoutExcluded(trackedFiles(projectRoot), policy.exclude);
  return withoutExcepted(collect({ projectRoot, files }), policy.exceptions);
}

export function runHygieneCli(cli) {
  return runCheckCli({ ...cli, runCheck: runHygieneCheck, label: 'Hygiene' });
}
