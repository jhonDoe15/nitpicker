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

export function withCliDefaults(options: CliInput): Omit<Cli, 'indexFile'> {
  const stderr = options.stderr ?? process.stderr;
  const progress = options.progress ?? stderr;
  return {
    ...options,
    analyzers: options.analyzers,
    currentProjectRoot: options.currentProjectRoot,
    workingDirectory: options.workingDirectory,
    arguments_: (options.arguments_ ?? process.argv.slice(2)).map(helpFlag),
    environment: options.environment ?? process.env,
    spawnEnvironment: { ...process.env, ...options.environment },
    interactive:
      typeof options.interactive === 'boolean'
        ? options.interactive
        : [process.stdin, options.stdout ?? process.stdout].every(isTerminal),
    snapshotAnalyzers: options.snapshotAnalyzers ?? options.analyzers,
    stdout: options.stdout ?? process.stdout,
    stderr,
    progress,
    runTasks: reportingProgress(options.runTasks ?? runScheduler, progress),
  };
}
