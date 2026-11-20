import type { SpawnSyncReturns } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { text } from 'node:stream/consumers';
import { fieldOf, optionalText, textOf, textsOf } from '../../../../../shared/values/readers.mts';
import { hostedRun } from '../client/host-client.mts';
import { hostedToolRun } from '../client/host-tools.mts';
import { hostsDirectory } from '../config/host-config.mts';
import { prepareGradleHosts, readPendingHosts } from './gradle-hosts.mts';

type Reply =
  | { readonly hosted: false }
  | {
      readonly hosted: true;
      readonly status: number;
      readonly stdout: string;
      readonly stderr: string;
    };

const NOT_HOSTED: Reply = { hosted: false };

function replyOf(result: SpawnSyncReturns<string> | undefined): Reply {
  return typeof result?.status === 'number'
    ? { hosted: true, status: result.status, stdout: result.stdout, stderr: result.stderr }
    : NOT_HOSTED;
}

function timeoutOf(directory: string): number | undefined {
  const timeoutMs = readPendingHosts(directory)?.timeoutMs ?? 0;
  return timeoutMs > 0 ? timeoutMs : undefined;
}

function runJob(job: unknown, directory: string): Reply {
  return replyOf(
    hostedRun(
      {
        java: textOf(fieldOf(job, 'java')),
        jvmArgs: textsOf(fieldOf(job, 'jvmArgs')),
        classpath: textsOf(fieldOf(job, 'classpath')),
        mainClass: textOf(fieldOf(job, 'mainClass')),
        args: textsOf(fieldOf(job, 'args')),
        cwd: textOf(fieldOf(job, 'cwd')),
      },
      timeoutOf(directory),
    ),
  );
}

function toolJob(job: unknown, directory: string): Reply {
  const stdoutFile = optionalText(fieldOf(job, 'stdoutFile'));
  return replyOf(
    hostedToolRun(textOf(fieldOf(job, 'command')), textsOf(fieldOf(job, 'args')), {
      cwd: textOf(fieldOf(job, 'cwd')),
      encoding: 'utf8',
      timeout: timeoutOf(directory),
      ...(stdoutFile === undefined ? {} : { stdoutFile }),
    }),
  );
}

export function answer(command: string | undefined, job: unknown): Reply {
  const directory = hostsDirectory();
  if (directory === undefined) {
    return NOT_HOSTED;
  }
  if (command === 'prepare') {
    prepareGradleHosts({
      directory,
      libraries: textsOf(fieldOf(job, 'libraries')),
      java: textOf(fieldOf(job, 'java')),
    });
    return { hosted: true, status: 0, stdout: '', stderr: '' };
  }
  if (command === 'run') {
    return runJob(job, directory);
  }
  if (command === 'tool') {
    return toolJob(job, directory);
  }
  throw new TypeError('host-job needs prepare, run or tool');
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  const job: unknown = JSON.parse(await text(process.stdin));
  process.stdout.write(JSON.stringify(answer(process.argv[2], job)));
}
