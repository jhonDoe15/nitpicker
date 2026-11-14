import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { PROGRESS_DESCRIPTOR, type ProjectJob } from './project-job.mts';
import type { TextOutput } from '../../../cli-context.mts';

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

const PREFIX = 'nitpicker: ';

function labelledLines(label: string, progress: TextOutput): (chunk: Buffer) => void {
  let pending = '';
  return (chunk) => {
    const lines = `${pending}${chunk.toString('utf8')}`.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const text = line.startsWith(PREFIX) ? line.slice(PREFIX.length) : line;
      progress.write(`${PREFIX}[${label}] ${text}\n`);
    }
  };
}

function settledOf(resultFile: string, ending: string): Settled {
  if (!existsSync(resultFile)) {
    return { exitCode: 2, error: `the project run stopped with ${ending} before it finished` };
  }
  const result: unknown = JSON.parse(readFileSync(resultFile, 'utf8'));
  const error = fieldOf(result, 'error');
  const exitCode = fieldOf(result, 'exitCode');
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
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    const progressPipe = child.stdio[PROGRESS_DESCRIPTOR];
    progressPipe?.on('data', labelledLines(label, progress));
    const finish = (settled: Settled): void => {
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        ...settled,
      });
    };
    child.on('error', (error) => {
      finish({ exitCode: 2, error: error.message });
    });
    child.on('close', (code, signal) => {
      finish(settledOf(job.resultFile, signal ?? `exit ${String(code)}`));
    });
    child.stdin?.end(JSON.stringify(job));
  });
}
