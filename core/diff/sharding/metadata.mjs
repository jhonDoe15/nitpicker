import { analyzerName } from '../reporting/report-model.mjs';
import { realpathSync } from 'node:fs';
import { runGit } from '../git/repository/command.mjs';
import path from 'node:path';
import { withTemporaryWorktree } from '../git/repository/worktree.mjs';
import { readJson } from './read-shards.mjs';

function resolveAnalyzerVersions(analyzers, liveProjectRoot, errors) {
  if (liveProjectRoot === undefined) {
    return;
  }
  for (const [index, analyzer] of analyzers.entries()) {
    try {
      if (typeof analyzer?.resolveVersion === 'function') {
        analyzer.version = analyzer.resolveVersion(liveProjectRoot);
      }
    } catch (error) {
      recordAnalyzerResolutionError({
        analyzer: analyzer,
        index: index,
        error: error,
        errors: errors,
      });
    }
  }
}

function resolveAnalyzerConfigurationHashes(analyzers, configurationRoot, errors) {
  for (const [index, analyzer] of analyzers.entries()) {
    try {
      const resolveConfigurationHash = analyzer?.resolveConfigurationHash;
      if (typeof resolveConfigurationHash === 'function') {
        analyzer.configurationHash = resolveConfigurationHash(configurationRoot);
      }
    } catch (error) {
      recordAnalyzerResolutionError({
        analyzer: analyzer,
        index: index,
        error: error,
        errors: errors,
      });
    }
  }
}

function recordAnalyzerResolutionError({ analyzer, index, error, errors }) {
  if (analyzer?.version === 'unresolved') {
    analyzer.version = 'unknown';
  }
  const tool = analyzerName(analyzer, index);
  if (!errors.some((resolutionError) => resolutionError.tool === tool)) {
    errors.push({
      tool,
      snapshot: 'aggregation',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function withHeadProjectRoot(liveProjectRoot, headSha, operation) {
  if (typeof headSha !== 'string' || headSha.length === 0) {
    throw new Error('Shard 0 has no headSha for policy resolution');
  }
  const liveRoot = realpathSync(liveProjectRoot);
  const repositoryRoot = realpathSync(runGit(liveRoot, ['rev-parse', '--show-toplevel']).trim());
  const projectRelativePath = path.relative(repositoryRoot, liveRoot);
  if (
    projectRelativePath === '..' ||
    projectRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(projectRelativePath)
  ) {
    throw new Error('Live project root is outside its Git repository');
  }
  return withTemporaryWorktree(repositoryRoot, headSha, (headWorktreeRoot) =>
    operation(path.join(headWorktreeRoot, projectRelativePath)),
  );
}

function recordConfigurationErrors(analyzers, error, errors) {
  const configured = [...analyzers.entries()].filter(
    ([, analyzer]) => typeof analyzer.resolveConfigurationHash === 'function',
  );
  for (const [index, analyzer] of configured)
    recordAnalyzerResolutionError({ analyzer, index, error, errors });
}

export function resolveMetadata({ analyzers, liveProjectRoot, policyRoot, inputRoot }) {
  const errors = [];
  resolveAnalyzerVersions(analyzers, liveProjectRoot, errors);
  if (policyRoot !== undefined) {
    resolveAnalyzerConfigurationHashes(analyzers, policyRoot, errors);
    return errors;
  }
  if (
    liveProjectRoot === undefined ||
    !analyzers.some((analyzer) => typeof analyzer.resolveConfigurationHash === 'function')
  )
    return errors;
  try {
    const headSha = readJson(path.join(inputRoot, '0'), 'summary.json', 0).headSha;
    withHeadProjectRoot(liveProjectRoot, headSha, (headProjectRoot) =>
      resolveAnalyzerConfigurationHashes(analyzers, headProjectRoot, errors),
    );
  } catch (error) {
    recordConfigurationErrors(analyzers, error, errors);
  }
  return errors;
}
