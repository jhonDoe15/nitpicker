import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { moduleFileText, readGoModule } from '../execution/go-module.mjs';
import { COVERAGE_PROFILE } from '../tests/go-test.mjs';
import { parseCoverProfile } from './coverage-profile.mjs';
import { goBranchFindings } from './go-branch-coverage.mjs';
import { goCrapFindings } from './go-crap.mjs';

function readProfile(context, modulePath) {
  const file = path.join(context.reportRoot, COVERAGE_PROFILE);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  return parseCoverProfile(text, modulePath);
}

function builtFiles(modulePath, testRun) {
  const failed = new Set(testRun.buildFailures);
  return ({ file }) => {
    const directory = path.posix.dirname(file);
    return !failed.has(directory === '.' ? modulePath : `${modulePath}/${directory}`);
  };
}

function sourceReader(projectRoot) {
  const files = new Map();
  return (file) => {
    if (!files.has(file)) {
      files.set(file, (moduleFileText(projectRoot, file) ?? '').split(/\r?\n/u));
    }
    return files.get(file);
  };
}

export function goCoverageFindings(context, { report, testRun }, policy = {}) {
  const modulePath = readGoModule(context.projectRoot)?.module;
  const profile = readProfile(context, modulePath);
  const sourceLines = sourceReader(context.projectRoot);
  const built = builtFiles(modulePath, testRun);
  const branches = report.branches.filter(built);
  return [
    ...goBranchFindings({ branches, profile, sourceLines }),
    ...goCrapFindings({
      functions: report.functions.filter(built),
      branches,
      profile,
      limit: policy.crapLimit,
      functionText: ({ file, start, end }) =>
        sourceLines(file)
          .slice(start - 1, end)
          .join('\n'),
    }),
  ];
}
