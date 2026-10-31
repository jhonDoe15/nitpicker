import { realpathSync } from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from '../tooling/tool-resolution.mjs';
import { publishHeadPolicy } from '../conventions/resolve.mjs';
import { configureAnalyzers } from '../configuration/configure-analyzers.mjs';
import { presetAnalyzers } from '../configuration/preset-analyzers.mjs';
import { describeConfigOverrides, loadConfig } from '../configuration/config.mjs';
import { parseDrillDownOptions, unknownArgumentError } from '../diff/comparison/cli.mjs';
import { didYouMean } from '../../shared/messages/closest-match.mjs';
import { createLayeredStore, resolveCacheStore } from '../diff/cache/cache-stores.mjs';
import { publishBaseSnapshot } from '../diff/cache/publish-cache.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { selectAnalyzers } from '../diff/execution/run-analyzers.mjs';
import { selectAnalyzerShard } from '../diff/sharding/sharding.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
  troubleshootingSentence,
} from '../../shared/messages/troubleshooting.mjs';

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
    throw troubleshootingError(
      'nitpicker cache publish requires NITPICKER_CACHE_URL',
      TROUBLESHOOTING_ANCHORS.cachePublishFails,
    );
  }
  return createLayeredStore({ remote, writeRemote: true });
}

const CACHE_OPTIONS = ['--analyzer', '--shard-count', '--shard-index'];
const CACHE_USAGE =
  'Usage: nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]';

function validateCommand(arguments_) {
  const [command, extra] = arguments_;
  if (command === undefined) {
    throw new Error(CACHE_USAGE);
  }
  if (command !== 'publish') {
    const suggestion = didYouMean(command, ['publish'], '');
    throw new Error(
      `Unknown cache command: ${arguments_.join(' ')}${suggestion === '' ? '.' : suggestion} ${CACHE_USAGE}`,
    );
  }
  if (extra !== undefined) {
    throw unknownArgumentError(extra, CACHE_OPTIONS, CACHE_USAGE);
  }
}

function writeOutcome({ stdout, result, selected }) {
  stdout.write(
    `Published ${String(result.published.length)} of ${String(selected.length)} base snapshots` +
      ` for ${result.commitSha}${result.published.length === 0 ? '' : `: ${result.published.join(', ')}`}\n`,
  );
  for (const skipped of result.skipped) stdout.write(`Not published: ${skipped}\n`);
  const help = troubleshootingSentence(TROUBLESHOOTING_ANCHORS.cachePublishFails);
  if (result.skipped.length > 0 && help !== undefined) {
    stdout.write(`${help}\n`);
  }
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
  });
  return writeOutcome({ stdout: cli.stdout, result, selected });
}
