import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { CliOptions, TextOutput } from '../../../cli-context.mts';
import type { ProjectCli } from '../../project-types.mts';

export type ProjectJob = {
  readonly input: {
    readonly arguments_: readonly string[];
    readonly environment: NodeJS.ProcessEnv;
    readonly interactive: boolean;
    readonly workingDirectory: string | undefined;
  };
  readonly indexFile: string | undefined;
  readonly scope: unknown;
  readonly options: CliOptions;
  readonly extraCli: ProjectCli;
  readonly resultFile: string;
};

export type Launch = {
  readonly label: string;
  readonly job: ProjectJob;
  readonly workerScript: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly progress: TextOutput;
};

export type Finished = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly error?: string;
};

type Settled = Pick<Finished, 'exitCode' | 'error'>;
type Labelled = { readonly write: (chunk: Buffer) => void; readonly flush: () => void };
type ReadResult = { readonly result: unknown } | { readonly unreadable: string };

export const PROGRESS_DESCRIPTOR = 3;
const PREFIX = 'nitpicker: ';
const PROJECT_RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000;

function labelledLines(label: string, progress: TextOutput): Labelled {
  let pending = '';
  function emit(line: string): void {
    const text = line.startsWith(PREFIX) ? line.slice(PREFIX.length) : line;
    progress.write(`${PREFIX}[${label}] ${text}\n`);
  }
  return {
    write: (chunk) => {
      const lines = `${pending}${chunk.toString('utf8')}`.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        emit(line);
      }
    },
    flush: () => {
      if (pending !== '') {
        emit(pending);
        pending = '';
      }
    },
  };
}

function readResult(resultFile: string): ReadResult {
  try {
    return { result: JSON.parse(readFileSync(resultFile, 'utf8')) };
  } catch (error) {
    return { unreadable: error instanceof Error ? error.message : String(error) };
  }
}

function settledOf(resultFile: string, ending: string): Settled {
  if (!existsSync(resultFile)) {
    return { exitCode: 2, error: `the project run stopped with ${ending} before it finished` };
  }
  const read = readResult(resultFile);
  if ('unreadable' in read) {
    const reason = `the project run stopped with ${ending} and left an unreadable result`;
    return { exitCode: 2, error: `${reason}: ${read.unreadable}` };
  }
  const error = fieldOf(read.result, 'error');
  const exitCode = fieldOf(read.result, 'exitCode');
  return typeof error === 'string'
    ? { exitCode: 2, error }
    : { exitCode: typeof exitCode === 'number' ? exitCode : 2 };
}

export function launchProject({
  label,
  job,
  workerScript,
  environment,
  progress,
}: Launch): Promise<Finished> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [workerScript], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      env: environment,
      timeout: PROJECT_RUN_TIMEOUT_MS,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    const lines = labelledLines(label, progress);
    child.stdio[PROGRESS_DESCRIPTOR]?.on('data', lines.write);
    function finish(settled: Settled): void {
      lines.flush();
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        ...settled,
      });
    }
    child.on('error', (error) => {
      finish({ exitCode: 2, error: error.message });
    });
    child.on('close', (code, signal) => {
      finish(settledOf(job.resultFile, signal ?? `exit ${String(code)}`));
    });
    child.stdin.end(JSON.stringify(job));
  });
}
