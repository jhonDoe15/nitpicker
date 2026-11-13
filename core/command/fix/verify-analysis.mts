import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { applyRunProfile } from '../../quick/profile.mts';
import { runQualitySnapshot } from '../../snapshot/run-snapshot.mts';
import { selectAnalyzers } from '../../diff/execution/run-analyzers.mts';
import { analyzersToVerify } from '../../fix/verify/analyzer-names.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { realTemporaryDirectory } from '../../tooling/temporary-files.mjs';
import { TEMPORARY_WORKTREE_PREFIX } from '../../diff/git/repository/worktree.mjs';
import { copyProject } from '../../../languages/typescript/fix/dead-code/project-copy.mjs';
import { COMPILE_FAILED_SKIPPED_RULE } from '../../../shared/rules/finding-helpers.mjs';
import { objectOf, textOf } from '../../../shared/values/readers.mts';
import type { ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';

export type VerifyRequest = {
  readonly tools: readonly string[];
  readonly files: readonly string[];
  readonly mode: 'narrow' | 'full';
};

export type VerifyAnalysis = {
  readonly findings: readonly object[];
  readonly errors: readonly string[];
  readonly unmatched: readonly string[];
};

export type VerifyCli = {
  readonly options: { readonly quick: boolean; readonly analyzerNames: readonly string[] };
  readonly currentProjectRoot: string;
  readonly analyzers?: unknown;
  readonly runTasks?: unknown;
  readonly headPolicy: unknown;
};

const selectAll: (
  analyzers: readonly ProfiledAnalyzer[],
  names: readonly string[],
) => readonly ProfiledAnalyzer[] = selectAnalyzers;
const namesFor: (
  analyzers: readonly ProfiledAnalyzer[],
  tools: readonly string[],
) => { readonly names: string[]; readonly unmatched: string[] } = analyzersToVerify;

const copyTo: (projectRoot: string, target: string) => void = copyProject;
const temporaryPrefix: string = TEMPORARY_WORKTREE_PREFIX;
const temporaryDirectory: () => string = realTemporaryDirectory;

function withProjectCopy<Result>(
  liveProjectRoot: string,
  run: (copyRoot: string) => Result,
): Result {
  const temporaryRoot = mkdtempSync(path.join(temporaryDirectory(), `${temporaryPrefix}fix-`));
  try {
    const copyRoot = path.join(temporaryRoot, 'head');
    copyTo(liveProjectRoot, copyRoot);
    return run(copyRoot);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function isProfiled(value: unknown): value is ProfiledAnalyzer {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'createInvocation' in value &&
    typeof value.createInvocation === 'function'
  );
}

function selectionFor(cli: VerifyCli, request: VerifyRequest) {
  const configured = Array.isArray(cli.analyzers) ? cli.analyzers.filter(isProfiled) : [];
  if (request.mode === 'full') {
    return { analyzers: selectAll(configured, cli.options.analyzerNames), unmatched: [] };
  }
  const quick = cli.options.quick
    ? configured
    : applyRunProfile(configured, { quick: true }).analyzers;
  const { names, unmatched } = namesFor(quick, request.tools);
  if (names.length === 0) {
    throw new Error('no analyzer reports the fixed rules');
  }
  return { analyzers: selectAll(quick, names), unmatched };
}

export function fixAnalysis(cli: VerifyCli): (request: VerifyRequest) => VerifyAnalysis {
  return (request) => {
    const { analyzers, unmatched } = selectionFor(cli, request);
    const snapshot = withProjectCopy(cli.currentProjectRoot, (copyRoot) =>
      runQualitySnapshot({
        analyzers,
        projectRoot: copyRoot,
        policyRoot: copyRoot,
        liveProjectRoot: cli.currentProjectRoot,
        toolRoot: PACKAGE_ROOT,
        headPolicy: objectOf(cli.headPolicy),
        scope: undefined,
        runTasks: cli.runTasks,
      }),
    );
    return {
      findings: snapshot.findings,
      errors: snapshot.toolErrors
        .filter(({ rule }) => rule !== COMPILE_FAILED_SKIPPED_RULE)
        .map(
          ({ tool, message }) =>
            `${tool === undefined ? 'analyzer' : textOf(tool)}: ${textOf(message)}`,
        ),
      unmatched,
    };
  };
}
