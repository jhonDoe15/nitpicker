import path from 'node:path';
import { runGit } from '../diff/git.mjs';
import { collectWorkingTreeChanges, readBaseFiles } from './changes.mjs';
import {
  checkBasePrettier,
  createLoggedExecutor,
  routeChangedFiles,
  runEslint,
  runPrettier,
} from './checkers.mjs';
import { clearWorkingTreeReports, writeWorkingTreeReport } from './reporters.mjs';

export function runWorkingTreeQuality({
  baseRef,
  fixSafe,
  projectRoot,
  outputRoot,
  toolRoot = projectRoot,
  execute,
}) {
  clearWorkingTreeReports(outputRoot);
  const repositoryRoot = runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim();
  const { comparison, changes } = collectWorkingTreeChanges({
    repositoryRoot,
    projectRoot,
    baseRef,
  });
  const { eslintFiles, prettierFiles } = routeChangedFiles(changes);
  const executor = createLoggedExecutor({ outputRoot, execute });
  const findings = [];
  const toolErrors = [];
  let prettierFixFiles = 0;
  let prettierFixSkipped = 0;

  if (fixSafe) {
    addResult(
      safelyRun('eslint-fix', () =>
        runEslint({
          files: eslintFiles,
          fix: true,
          projectRoot,
          toolRoot,
          executor,
        }),
      ),
      findings,
      toolErrors,
    );

    const prettierSelection = selectPrettierFixFiles({
      repositoryRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      files: prettierFiles,
      projectRoot,
      toolRoot,
      executor,
      toolErrors,
    });
    prettierFixFiles = prettierSelection.files.length;
    prettierFixSkipped = prettierSelection.skipped;
    addResult(
      safelyRun('prettier-fix', () =>
        runPrettier({
          files: prettierSelection.files,
          write: true,
          projectRoot,
          toolRoot,
          executor,
        }),
      ),
      findings,
      toolErrors,
    );
  }

  addResult(
    safelyRun('eslint-check', () =>
      runEslint({
        files: eslintFiles,
        fix: false,
        projectRoot,
        toolRoot,
        executor,
      }),
    ),
    findings,
    toolErrors,
  );
  addResult(
    safelyRun('prettier-check', () =>
      runPrettier({
        files: prettierFiles,
        write: false,
        projectRoot,
        toolRoot,
        executor,
      }),
    ),
    findings,
    toolErrors,
  );

  const checkedFiles = new Set([
    ...eslintFiles.map(({ path: filePath }) => filePath),
    ...prettierFiles.map(({ path: filePath }) => filePath),
  ]).size;
  const outcome = reportOutcome(findings, toolErrors);
  const report = {
    summary: {
      requestedBaseRef: comparison.requestedBaseRef,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      status: outcome.status,
      changedPaths: changes.length,
      checkedFiles,
      fixSafe,
      eslintFixFiles: fixSafe ? eslintFiles.length : 0,
      prettierFixFiles,
      prettierFixSkipped,
      outputRoot: relativeOutputRoot(projectRoot, outputRoot),
    },
    changes: changes.map(serializeChange),
    findings,
    toolErrors,
  };
  executor.writeLogs();
  const text = writeWorkingTreeReport(outputRoot, report);
  return {
    report,
    text,
    exitCode: outcome.exitCode,
  };
}

function selectPrettierFixFiles({
  repositoryRoot,
  mergeBaseSha,
  files,
  projectRoot,
  toolRoot,
  executor,
  toolErrors,
}) {
  const baseSources = safelyReadBaseFiles({
    repositoryRoot,
    mergeBaseSha,
    files,
    toolErrors,
  });
  if (baseSources === undefined) {
    return { files: [], skipped: files.length };
  }

  const safeFiles = [];
  const existingFiles = [];
  for (const file of files) {
    const source = baseSources.get(file.path);
    if (source === undefined) {
      safeFiles.push(file);
    } else {
      existingFiles.push({ file, source });
    }
  }

  const eligibility = safelyRun('prettier-base-check', () =>
    checkBasePrettier({
      files: existingFiles,
      projectRoot,
      toolRoot,
      executor,
    }),
  );
  if (eligibility.toolError !== undefined) {
    toolErrors.push(eligibility.toolError);
    return { files: safeFiles, skipped: existingFiles.length };
  }

  toolErrors.push(...eligibility.toolErrors);
  let skipped = 0;
  for (const { file } of existingFiles) {
    if (eligibility.cleanPaths.has(file.path)) {
      safeFiles.push(file);
    } else {
      skipped += 1;
    }
  }
  return { files: safeFiles, skipped };
}

function safelyReadBaseFiles({ repositoryRoot, mergeBaseSha, files, toolErrors }) {
  try {
    return readBaseFiles({ repositoryRoot, mergeBaseSha, files });
  } catch (error) {
    toolErrors.push({
      tool: 'git-base-files',
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function safelyRun(tool, operation) {
  try {
    return operation();
  } catch (error) {
    return {
      findings: [],
      toolError: {
        tool,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function addResult(result, findings, toolErrors) {
  if (Array.isArray(result.findings)) {
    findings.push(...result.findings);
  }
  if (result.toolError !== undefined) {
    toolErrors.push(result.toolError);
  }
}

function reportOutcome(findings, toolErrors) {
  if (toolErrors.length > 0) {
    return { status: 'tool-error', exitCode: 2 };
  }
  if (findings.length > 0) {
    return { status: 'violations', exitCode: 1 };
  }
  return { status: 'clean', exitCode: 0 };
}

function serializeChange(change) {
  return {
    path: change.path,
    sources: change.sources,
    statuses: change.statuses,
    previousPaths: change.previousRepositoryPaths,
    deleted: !change.isFile,
  };
}

function relativeOutputRoot(projectRoot, outputRoot) {
  const relativePath = path.relative(projectRoot, outputRoot);
  if (relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return outputRoot;
  }
  return relativePath.length === 0 ? '.' : relativePath.replaceAll('\\', '/');
}
