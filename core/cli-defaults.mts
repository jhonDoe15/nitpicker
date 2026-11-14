import { reportingProgress } from './diff/execution/progress.mts';
import { runScheduler } from './diff/execution/run-analyzers.mts';
import type { Cli, CliInput } from './cli-context.mts';

const HELP_ALIAS = '-h';

function helpFlag(argument: string): string {
  return argument === HELP_ALIAS ? '--help' : argument;
}

function isTerminal(stream: object): boolean {
  return 'isTTY' in stream && stream.isTTY === true;
}

type Host = Pick<NodeJS.Process, 'argv' | 'env' | 'stdin' | 'stdout' | 'stderr'>;

export function withCliDefaults(options: CliInput, host: Host): Omit<Cli, 'indexFile'> {
  const stderr = options.stderr ?? host.stderr;
  const progress = options.progress ?? stderr;
  return {
    ...options,
    analyzers: options.analyzers,
    currentProjectRoot: options.currentProjectRoot,
    workingDirectory: options.workingDirectory,
    arguments_: (options.arguments_ ?? host.argv.slice(2)).map(helpFlag),
    environment: options.environment ?? host.env,
    spawnEnvironment: { ...host.env, ...options.environment },
    interactive:
      typeof options.interactive === 'boolean'
        ? options.interactive
        : [host.stdin, options.stdout ?? host.stdout].every(isTerminal),
    snapshotAnalyzers: options.snapshotAnalyzers ?? options.analyzers,
    stdout: options.stdout ?? host.stdout,
    stderr,
    progress,
    runTasks: reportingProgress(options.runTasks ?? runScheduler, progress),
  };
}
