import { existsSync } from 'node:fs';
import { REPOSITORY_HYGIENE_TOOL, collectRepositoryFindings } from './files/repository-files.mjs';
import { runCheckCli } from './cli.mjs';
import { hardcodedNameFindings } from './migrations/hardcoded-names.mjs';
import { foreignKeyIndexFindings } from './schema/foreign-key-index.mjs';
import { migrationOrderFindings } from './migrations/migration-order.mjs';
import { withoutExcepted, withoutExcluded } from './rules.mjs';
import { trackedFiles } from './tracked-files.mjs';

function collectRepositoryHygiene(context) {
  return [
    ...collectRepositoryFindings(context),
    ...migrationOrderFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...hardcodedNameFindings(REPOSITORY_HYGIENE_TOOL, context),
    ...foreignKeyIndexFindings(REPOSITORY_HYGIENE_TOOL, context),
  ];
}

const CHECKS = {
  [REPOSITORY_HYGIENE_TOOL]: collectRepositoryHygiene,
};

function baseFilesOf(baselineRoot, exclude) {
  return baselineRoot === undefined || !existsSync(baselineRoot)
    ? undefined
    : withoutExcluded(trackedFiles(baselineRoot), exclude);
}

export function runHygieneCheck({ check, projectRoot, policy = {}, baselineRoot, parseYaml }) {
  const collect = CHECKS[check];
  if (collect === undefined) {
    throw new Error(`Unknown hygiene check: ${check}`);
  }
  const files = withoutExcluded(trackedFiles(projectRoot), policy.exclude);
  const baseFiles = baseFilesOf(baselineRoot, policy.exclude);
  return withoutExcepted(
    collect({ projectRoot, files, baselineRoot, baseFiles, parseYaml }),
    policy.exceptions,
  );
}

export function runHygieneCli(cli) {
  return runCheckCli({
    ...cli,
    runCheck: (options) => runHygieneCheck({ ...options, parseYaml: cli.parseYaml }),
    label: 'Hygiene',
  });
}
