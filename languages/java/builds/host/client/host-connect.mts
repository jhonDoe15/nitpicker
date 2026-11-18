import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { text } from 'node:stream/consumers';
import { HOST_MAIN_CLASS } from '../config/host-config.mts';
import { decode, encode } from './wire/host-wire.mts';
import {
  BUSY,
  READY,
  SOCKET,
  forgetHost,
  hostFile,
  hostPid,
  isHostProcess,
  isLeased,
  readyAge,
  stopHost,
  takeLease,
} from '../config/host-files.mts';
import { attempt } from '../../../../../shared/values/attempt/attempt.mts';
import { fieldOf, numberOr, textOf, textsOf } from '../../../../../shared/values/readers.mts';

type Launch = {
  readonly java: string;
  readonly jvmArgs: readonly string[];
  readonly classpath: string;
  readonly owner: number;
  readonly maxHosts: number;
};
type Job = {
  readonly dir: string;
  readonly key: string;
  readonly launch: Launch;
  readonly request: readonly string[];
  readonly timeoutMs: number;
};
type Outcome =
  | {
      readonly kind: 'result';
      readonly status: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: 'timeout' | 'crashed' | 'stale' }
  | { readonly kind: 'unavailable'; readonly reason: string };

const START_TIMEOUT_MS = 60_000;
const POLL_MS = 25;
const STALE_LOCK_MS = 120_000;
const LOCK = '.lock';
const HOST_FLAGS = ['-XX:+UseG1GC', '-XX:MaxHeapFreeRatio=30', '-XX:MinHeapFreeRatio=10'];

function liveHosts(job: Job): string[] {
  const keys = readdirSync(job.dir)
    .filter((name) => name.endsWith(READY))
    .map((name) => name.slice(0, -READY.length));
  const live = keys.filter((key) => isHostProcess(hostPid(job.dir, key)));
  for (const key of keys.filter((candidate) => !live.includes(candidate))) {
    forgetHost(job.dir, key);
  }
  return live.filter((key) => key !== job.key);
}

function evictIdle(job: Job): void {
  const hosts = liveHosts(job);
  const idle = hosts
    .filter((key) => !(existsSync(hostFile(job.dir, key, BUSY)) || isLeased(job.dir, key)))
    .toSorted((left, right) => readyAge(job.dir, left) - readyAge(job.dir, right));
  let live = hosts.length;
  for (const key of idle) {
    if (live < job.launch.maxHosts) {
      return;
    }
    stopHost(job.dir, key);
    live -= 1;
  }
}

function until(done: () => boolean, timeoutMs: number): Promise<boolean> {
  if (done()) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const finished = done();
      if (finished || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(finished);
      }
    }, POLL_MS);
  });
}

async function awaitReady(job: Job, exited: () => boolean): Promise<boolean> {
  const ready = hostFile(job.dir, job.key, READY);
  await until(() => exited() || existsSync(ready), START_TIMEOUT_MS);
  return existsSync(ready);
}

async function startHost(job: Job): Promise<boolean> {
  evictIdle(job);
  const { java, jvmArgs, classpath, owner } = job.launch;
  const child = spawn(
    java,
    [...jvmArgs, ...HOST_FLAGS, '-cp', classpath, HOST_MAIN_CLASS, job.dir, job.key, String(owner)],
    { detached: true, stdio: 'ignore', cwd: job.dir },
  );
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  child.on('error', () => {
    exited = true;
  });
  const ready = await awaitReady(job, () => exited);
  child.unref();
  return ready;
}

async function ensureHost(job: Job): Promise<boolean> {
  const ready = hostFile(job.dir, job.key, READY);
  if (isHostProcess(hostPid(job.dir, job.key))) {
    return true;
  }
  if (existsSync(ready)) {
    forgetHost(job.dir, job.key);
  }
  const lock = hostFile(job.dir, job.key, LOCK);
  if (
    !attempt(() => {
      mkdirSync(lock);
    }).ok
  ) {
    return waitForOther(job, lock);
  }
  try {
    return await startHost(job);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function lockReleased(lock: string): boolean {
  const age = Date.now() - (statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
  if (age > STALE_LOCK_MS) {
    rmSync(lock, { recursive: true, force: true });
    return true;
  }
  return !existsSync(lock);
}

async function waitForOther(job: Job, lock: string): Promise<boolean> {
  await until(() => lockReleased(lock), START_TIMEOUT_MS);
  return existsSync(hostFile(job.dir, job.key, READY)) && isHostProcess(hostPid(job.dir, job.key));
}

type Conversation = {
  readonly socket: Socket;
  readonly resolve: (outcome: Outcome) => void;
  pending: Buffer;
  started: boolean;
  done: boolean;
  timer: NodeJS.Timeout | undefined;
};

function finish(conversation: Conversation, outcome: Outcome): void {
  if (!conversation.done) {
    conversation.done = true;
    clearTimeout(conversation.timer);
    conversation.socket.destroy();
    conversation.resolve(outcome);
  }
}

function receive(conversation: Conversation, message: readonly Buffer[]): void {
  const [first = Buffer.alloc(0), out = Buffer.alloc(0), err = Buffer.alloc(0)] = message;
  const head = first.toString('utf8');
  if (!conversation.started && head === 'busy') {
    finish(conversation, { kind: 'unavailable', reason: 'busy' });
  } else if (!conversation.started && head === 'started') {
    conversation.started = true;
  } else {
    finish(conversation, {
      kind: 'result',
      status: Number.parseInt(head, 10),
      stdout: out.toString('utf8'),
      stderr: err.toString('utf8'),
    });
  }
}

function drain(conversation: Conversation): void {
  const message = decode(conversation.pending);
  if (message !== undefined) {
    conversation.pending = conversation.pending.subarray(message.used);
    receive(conversation, message.frames);
  }
}

function receiveChunk(conversation: Conversation, chunk: Buffer): void {
  conversation.pending = Buffer.concat([conversation.pending, chunk]);
  drain(conversation);
  drain(conversation);
}

function sendRequest(job: Job, conversation: Conversation): void {
  conversation.socket.write(encode(job.request));
  conversation.timer = setTimeout(() => {
    stopHost(job.dir, job.key);
    finish(conversation, { kind: 'timeout' });
  }, job.timeoutMs);
}

function talk(job: Job): Promise<Outcome> {
  return new Promise((resolve) => {
    const conversation: Conversation = {
      socket: connect(hostFile(job.dir, job.key, SOCKET)),
      resolve,
      pending: Buffer.alloc(0),
      started: false,
      done: false,
      timer: undefined,
    };
    function closed(): void {
      finish(conversation, conversation.started ? { kind: 'crashed' } : { kind: 'stale' });
    }
    conversation.socket.on('connect', () => {
      sendRequest(job, conversation);
    });
    conversation.socket.on('data', (chunk: Buffer) => {
      receiveChunk(conversation, chunk);
    });
    conversation.socket.on('error', closed);
    conversation.socket.on('close', closed);
  });
}

async function converse(job: Job): Promise<Outcome> {
  return (await ensureHost(job))
    ? talk(job)
    : { kind: 'unavailable', reason: 'the host did not start' };
}

async function exchange(job: Job): Promise<Outcome> {
  const first = await converse(job);
  if (first.kind !== 'stale') {
    return first;
  }
  stopHost(job.dir, job.key);
  const second = await converse(job);
  if (second.kind !== 'stale') {
    return second;
  }
  stopHost(job.dir, job.key);
  return { kind: 'unavailable', reason: 'the host did not answer' };
}

function jobOf(input: string): Job {
  const value: unknown = JSON.parse(input);
  const launch = fieldOf(value, 'launch');
  return {
    dir: textOf(fieldOf(value, 'dir')),
    key: textOf(fieldOf(value, 'key')),
    launch: {
      java: textOf(fieldOf(launch, 'java')),
      jvmArgs: textsOf(fieldOf(launch, 'jvmArgs')),
      classpath: textOf(fieldOf(launch, 'classpath')),
      owner: numberOr(fieldOf(launch, 'owner'), 0),
      maxHosts: numberOr(fieldOf(launch, 'maxHosts'), 1),
    },
    request: textsOf(fieldOf(value, 'request')),
    timeoutMs: numberOr(fieldOf(value, 'timeoutMs'), START_TIMEOUT_MS),
  };
}

const job = jobOf(await text(process.stdin));
const lease = takeLease(job.dir, job.key);
try {
  process.stdout.write(JSON.stringify(await exchange(job)));
} finally {
  rmSync(lease, { force: true });
}
