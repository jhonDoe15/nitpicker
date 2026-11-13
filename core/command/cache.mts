import { realpathSync } from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from '../configuration/project-checks/project-root.mjs';
import { publishHeadPolicy } from '../conventions/resolve.mjs';
import { configureAll, presetAnalyzers } from '../configuration/preset-analyzers.mts';
import { describeConfigOverrides, loadConfig } from '../configuration/config.mjs';
import { parseDrillDownOptions, unknownArgumentError } from '../diff/comparison/cli.mts';
import { didYouMean } from '../../shared/messages/closest-match.mjs';
import { createLayeredStore, resolveCacheStore } from '../diff/cache/cache-stores.mjs';
import { publishBaseSnapshot } from '../diff/cache/publish-cache.mts';
import { runGit } from '../diff/git/repository/command.mjs';
import { selectAnalyzers } from '../diff/execution/run-analyzers.mjs';
import { selectAnalyzerShard } from '../diff/sharding/sharding.mts';
import { CACHE_PUBLISH_USAGE_TEXT } from '../help/usage-text.mts';
import {
  type Analyzer,
  type ProfiledAnalyzer,
  analyzersOf,
} from '../../shared/values/analyzers.mts';
import { textOf, textsOf } from '../../shared/values/readers.mts';
import type { TextOutput } from '../cli-context.mts';
import type { NitpickerConfig } from '../configuration/config-types.mts';

const HELP = '--help';

export const CACHE_PUBLISH_OPTIONS = ['--analyzer', '--shard-count', '--shard-index', HELP];
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
  troubleshootingSentence,
} from '../../shared/messages/troubleshooting.mjs';

type CacheCli = {
  readonly arguments_: readonly string[];
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly currentProjectRoot?: string | undefined;
  readonly analyzers?: readonly Analyzer[] | undefined;
  readonly runTasks?: unknown;
};

type ShardOptions = {
  readonly analyzerNames: unknown;
  readonly shardCount: number | undefined;
  readonly shardIndex: number | undefined;
};

type PublishOutcome = {
  readonly commitSha: string;
  readonly published: readonly string[];
  readonly skipped: readonly string[];
};

function selectedAnalyzers(
  configured: readonly ProfiledAnalyzer[],
  options: ShardOptions,
): Analyzer[] {
  const selected = analyzersOf(
    options.shardCount === undefined || options.shardIndex === undefined
      ? selectAnalyzers(configured, options.analyzerNames)
      : selectAnalyzerShard(configured, options.shardCount, options.shardIndex),
  );
  if (selected.length === 0) throw new Error('No quality analyzers are configured.');
  return selected;
}

function writableStore(projectRoot: string, cli: CacheCli): unknown {
  const { remote, warnings } = resolveCacheStore({ projectRoot, environment: cli.environment });
  for (const warning of textsOf(warnings)) cli.stderr.write(`nitpicker: ${warning}\n`);
  if (remote === undefined) {
    throw troubleshootingError(
      'nitpicker cache publish requires NITPICKER_CACHE_URL',
      TROUBLESHOOTING_ANCHORS.cachePublishFails,
    );
  }
  return createLayeredStore({ local: undefined, remote, writeRemote: true });
}

const CACHE_USAGE =
  'Usage: nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]';

function rejectUnsupportedOptions(commandArguments: readonly string[]): void {
  const unsupported = commandArguments.find(
    (argument) => argument.startsWith('--') && !CACHE_PUBLISH_OPTIONS.includes(argument),
  );
  if (unsupported !== undefined) {
    throw unknownArgumentError(unsupported, CACHE_PUBLISH_OPTIONS, CACHE_USAGE);
  }
}

function validateCommand(arguments_: readonly string[]): void {
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
    throw unknownArgumentError(extra, CACHE_PUBLISH_OPTIONS, CACHE_USAGE);
  }
}

function outcomeOf(published: {
  readonly commitSha: unknown;
  readonly published: unknown;
  readonly skipped: unknown;
}): PublishOutcome {
  return {
    commitSha: textOf(published.commitSha),
    published: textsOf(published.published),
    skipped: textsOf(published.skipped),
  };
}

function writeOutcome({
  stdout,
  result,
  selected,
}: {
  readonly stdout: TextOutput;
  readonly result: PublishOutcome;
  readonly selected: readonly Analyzer[];
}): number {
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

export function runCacheCommand(cli: CacheCli): number {
  rejectUnsupportedOptions(cli.arguments_);
  const options = parseDrillDownOptions(cli.arguments_);
  const remainingArguments = textsOf(options.remainingArguments);
  if (remainingArguments.includes(HELP)) {
    cli.stdout.write(CACHE_PUBLISH_USAGE_TEXT);
    return 0;
  }
  validateCommand(remainingArguments);
  const projectRoot = textOf(
    cli.currentProjectRoot === undefined
      ? resolveProjectRoot()
      : realpathSync(cli.currentProjectRoot),
  );
  const config: NitpickerConfig = loadConfig(projectRoot);
  const headPolicy: unknown = publishHeadPolicy(config, projectRoot, {
    maven: cli.environment?.['NITPICKER_MAVEN'],
  });
  const selected = selectedAnalyzers(
    configureAll(presetAnalyzers(config, cli.analyzers), config, headPolicy),
    options,
  );
  const store = writableStore(projectRoot, cli);
  const repositoryRoot = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  const published = publishBaseSnapshot({
    repositoryRoot,
    projectRelativePath: path.relative(repositoryRoot, projectRoot) || '.',
    liveProjectRoot: projectRoot,
    analyzers: selected,
    store,
    configOverrides: describeConfigOverrides(config),
    headPolicy,
    runTasks: cli.runTasks,
    warn: (message: string) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
  return writeOutcome({ stdout: cli.stdout, result: outcomeOf(published), selected });
}
