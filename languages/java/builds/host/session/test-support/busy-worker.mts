import { parentPort, workerData } from 'node:worker_threads';
import { hostedRun } from '../../client/host-client.mts';
import { PLAIN_TOOL } from '../../config/host-config.mts';
import { fieldOf, textOf, textsOf } from '../../../../../../shared/values/readers.mts';

const TIMEOUT_MS = 60_000;
const job: unknown = workerData;
const result = hostedRun(
  {
    java: textOf(fieldOf(job, 'java')),
    jvmArgs: [],
    classpath: textsOf(fieldOf(job, 'classpath')),
    mainClass: 'probe.Probe',
    args: textsOf(fieldOf(job, 'args')),
    cwd: textOf(fieldOf(job, 'cwd')),
  },
  TIMEOUT_MS,
  { 'probe.Probe': PLAIN_TOOL },
);
parentPort?.postMessage(result?.status);
