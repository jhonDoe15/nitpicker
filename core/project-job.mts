import { writeSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { runProjectOf } from './cli.mts';
import { withCliDefaults } from './cli-defaults.mts';
import { redirectToBundledTypeScriptApi } from '../languages/typescript/typescript-api/api-selection.mts';
import { PROGRESS_DESCRIPTOR, type ProjectJob } from './projects/run/execution/launch.mts';
import type { CliInput } from './cli-context.mts';
import type { Scope } from './scope/scope-findings.mts';
import { fieldOf, textsOf } from '../shared/values/readers.mts';
import { withInternalFrames } from '../shared/messages/crashes/internal-error.mts';

function scopeOf(value: unknown): Scope | undefined {
  return value === undefined ? undefined : { paths: textsOf(fieldOf(value, 'paths')) };
}

type JobResult = { readonly exitCode: number } | { readonly error: string };

const jobOf: (input: string) => ProjectJob = JSON.parse;

const progress = {
  fd: PROGRESS_DESCRIPTOR,
  write: (line: string): number => writeSync(PROGRESS_DESCRIPTOR, line),
};

async function settle(job: ProjectJob, injected: CliInput): Promise<JobResult> {
  try {
    const defaults = withCliDefaults({ ...job.input, ...injected, progress }, process);
    const cli = {
      ...defaults,
      indexFile: job.indexFile,
      scope: scopeOf(job.scope),
      options: job.options,
    };
    Object.assign(cli.environment, redirectToBundledTypeScriptApi(cli.environment));
    const exitCode = await runProjectOf(cli)(job.options, job.extraCli);
    return { exitCode };
  } catch (error) {
    return {
      error: withInternalFrames(error instanceof Error ? error.message : String(error), error),
    };
  }
}

export async function workOnJob(injected: CliInput = {}): Promise<void> {
  const job = jobOf(await text(process.stdin));
  await writeFile(job.resultFile, JSON.stringify(await settle(job, injected)));
}
