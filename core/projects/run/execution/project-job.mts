import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { runProjectOf } from '../../../cli.mts';
import { withCliDefaults } from '../../../cli-defaults.mts';
import { redirectToBundledTypeScriptApi } from '../../../../languages/typescript/typescript-api/api-selection.mjs';
import type { CliInput, CliOptions } from '../../../cli-context.mts';
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

export type JobResult = { readonly exitCode: number } | { readonly error: string };

export const PROGRESS_DESCRIPTOR = 3;

const redirect: (environment: NodeJS.ProcessEnv) => void = redirectToBundledTypeScriptApi;

const progress = {
  fd: PROGRESS_DESCRIPTOR,
  write: (text: string): number => writeSync(PROGRESS_DESCRIPTOR, text),
};

async function settle(job: ProjectJob, injected: CliInput): Promise<JobResult> {
  try {
    const defaults = withCliDefaults({ ...job.input, ...injected, progress }, process);
    const cli = { ...defaults, indexFile: job.indexFile, scope: job.scope, options: job.options };
    redirect(cli.environment);
    const exitCode = await runProjectOf(cli)(job.options, job.extraCli);
    return { exitCode };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function workOnJob(injected: CliInput = {}): Promise<void> {
  const job: ProjectJob = JSON.parse(readFileSync(0, 'utf8'));
  writeFileSync(job.resultFile, JSON.stringify(await settle(job, injected)));
}
