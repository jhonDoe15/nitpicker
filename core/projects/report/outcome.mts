import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, listOf, numberOr, optionalText } from '../../../shared/values/readers.mts';
import type { ProjectOutcome } from '../project-types.mts';

type Counts = Pick<ProjectOutcome, 'newEnforceableFindings' | 'toolErrors' | 'policyDigest'>;

type Facts = {
  readonly exitCode: number;
  readonly newEnforceableFindings: number;
  readonly toolErrors: number;
  readonly error: string | undefined;
};

function readJson(file: string): unknown {
  if (statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function readCounts(reportRoot: string): Counts {
  const summary = readJson(path.join(reportRoot, 'summary.json')) ?? {};
  const toolErrors = readJson(path.join(reportRoot, 'tool-errors.json')) ?? [];
  const policyDigest = optionalText(fieldOf(summary, 'policyDigest'));
  return {
    newEnforceableFindings: numberOr(
      fieldOf(summary, 'newEnforceableFindings') ?? fieldOf(summary, 'enforceableFindings'),
      0,
    ),
    toolErrors: listOf(toolErrors).length,
    ...(policyDigest === undefined ? {} : { policyDigest }),
  };
}

function statusOf({ exitCode, newEnforceableFindings, toolErrors, error }: Facts): string {
  if (error !== undefined) {
    return 'error';
  }
  if (newEnforceableFindings > 0) {
    return 'failed';
  }
  return toolErrors > 0 || exitCode === 2 ? 'error' : 'passed';
}

export function outcomeOf({
  exitCode,
  reportRoot,
  error,
}: {
  readonly exitCode: number;
  readonly reportRoot: string;
  readonly error?: string | undefined;
}): ProjectOutcome {
  const counts: Counts =
    error === undefined ? readCounts(reportRoot) : { newEnforceableFindings: 0, toolErrors: 0 };
  const facts = {
    exitCode,
    newEnforceableFindings: counts.newEnforceableFindings,
    toolErrors: counts.toolErrors,
    error,
  };
  return {
    exitCode,
    ...counts,
    ...(error === undefined ? {} : { error }),
    status: statusOf(facts),
    complete: error === undefined && counts.toolErrors === 0 && exitCode !== 2,
  };
}

export function writeFailureReport(reportRoot: string, projectPath: string, message: string): void {
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(
    path.join(reportRoot, 'report.txt'),
    `Nitpicker could not run project ${projectPath}:\n${message}\n`,
  );
}
