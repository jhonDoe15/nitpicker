import { realpathSync } from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from '../tooling/tool-resolution.mjs';
import { publishHeadPolicy } from '../conventions/resolve.mjs';
import { configureAnalyzers } from '../configuration/configure-analyzers.mjs';
import { presetAnalyzers } from '../configuration/preset-analyzers.mjs';
import { describeConfigOverrides, loadConfig } from '../configuration/config.mjs';
import { parseDrillDownOptions } from '../diff/comparison/cli.mjs';
import { createLayeredStore, resolveCacheStore } from '../diff/cache/cache-stores.mjs';
import { publishBaseSnapshot } from '../diff/cache/publish-cache.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { selectAnalyzers } from '../diff/execution/run-analyzers.mjs';
import { selectAnalyzerShard } from '../diff/sharding/sharding.mjs';

function selectedAnalyzers(configured, options) {
  const selected =
    options.shardCount === undefined
      ? selectAnalyzers(configured, options.analyzerNames)
      : selectAnalyzerShard(configured, options.shardCount, options.shardIndex);
  if (selected.length === 0) throw new Error('No quality analyzers are configured.');
  return selected;
}

function writableStore(projectRoot, cli) {
  const { remote, warnings } = resolveCacheStore({ projectRoot, environment: cli.environment });
  for (const warning of warnings) cli.stderr.write(`nitpicker: ${warning}\n`);
  if (remote === undefined) {
    throw new Error('nitpicker cache publish requires NITPICKER_CACHE_URL');
  }
  return createLayeredStore({ remote, writeRemote: true });
}

function validateCommand(arguments_) {
  if (arguments_.length === 1 && arguments_[0] === 'publish') return;
  throw new Error(
    arguments_.length === 0 || arguments_[0] === 'publish'
      ? 'Usage: nitpicker cache publish'
      : `Unknown cache command: ${arguments_.join(' ')}`,
  );
}

function writeOutcome({ stdout, result, selected }) {
  stdout.write(
    `Published ${String(result.published.length)} of ${String(selected.length)} base snapshots` +
      ` for ${result.commitSha}${result.published.length === 0 ? '' : `: ${result.published.join(', ')}`}\n`,
  );
  for (const skipped of result.skipped) stdout.write(`Not published: ${skipped}\n`);
  return result.skipped.length === 0 ? 0 : 2;
}

export function runCacheCommand(cli) {
  const options = parseDrillDownOptions(cli.arguments_);
  validateCommand(options.remainingArguments);
  const projectRoot =
    cli.currentProjectRoot === undefined
      ? resolveProjectRoot()
      : realpathSync(cli.currentProjectRoot);
  const config = loadConfig(projectRoot);
  const headPolicy = publishHeadPolicy(config, projectRoot);
  const configured = configureAnalyzers(presetAnalyzers(config, cli.analyzers), config, headPolicy);
  const selected = selectedAnalyzers(configured, options);
  const store = writableStore(projectRoot, cli);
  const repositoryRoot = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  const result = publishBaseSnapshot({
    repositoryRoot,
    projectRelativePath: path.relative(repositoryRoot, projectRoot) || '.',
    liveProjectRoot: projectRoot,
    analyzers: selected,
    store,
    configOverrides: describeConfigOverrides(config),
    headPolicy,
    runTasks: cli.runTasks,
    warn: (message) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
  return writeOutcome({ stdout: cli.stdout, result, selected });
}
