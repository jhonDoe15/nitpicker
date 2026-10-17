import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';

const OPTIONS_NITPICKER_SETS = {
  flags: [
    '--watch',
    '--watchAll',
    '--coverage',
    '--collectCoverage',
    '--json',
    '--ci',
    '--silent',
    '--passWithNoTests',
    '--onlyChanged',
    '-o',
    '--onlyFailures',
    '-f',
    '--lastCommit',
    '--changedFilesWithAncestor',
    '--findRelatedTests',
    '--showConfig',
    '--listTests',
    '--clearCache',
  ],
  valued: [
    '--outputFile',
    '--coverageDirectory',
    '--coverageReporters',
    '--coverageProvider',
    '--collectCoverageFrom',
    '--coverageThreshold',
    '--reporters',
    '--testTimeout',
    '--maxWorkers',
    '-w',
    '--changedSince',
    '--shard',
    '--testNamePattern',
    '-t',
  ],
};

function withoutRelatedFiles(tokens) {
  const kept = [];
  let related = false;
  for (const token of tokens) {
    if (token.startsWith('-')) {
      related = token === '--findRelatedTests';
    }
    if (!related || token.startsWith('-')) {
      kept.push(token);
    }
  }
  return kept;
}

export function jestArguments(command, nitpickerArguments, { leading, trailing }) {
  return [
    ...leading,
    ...withoutOptions(withoutRelatedFiles(command.arguments_), OPTIONS_NITPICKER_SETS),
    ...nitpickerArguments,
    ...trailing,
  ];
}
