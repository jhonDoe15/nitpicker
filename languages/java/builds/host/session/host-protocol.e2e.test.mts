import { Worker } from 'node:worker_threads';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { javaCommand } from '../../../maven/programs/java-command.mts';
import { hostedToolSpawn } from '../client/host-tools.mts';
import { READY, BUSY, hostPid, isAlive, hostFile } from '../config/host-files.mts';
import { startProbeHost } from './test-support/probe-host.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const probe = enabled ? startProbeHost(process.env['NITPICKER_MAVEN']) : undefined;
const WAIT_MS = 30_000;
const HOSTS_AFTER_TOOLS = 4;
const EXPECTED_ERROR =
  '<sources>/B.java:1: Fehler: Symbol nicht gefunden\nclass B { A a; int y = "text"; }\n          ^\n  Symbol: Klasse A\n  Ort: Klasse B\n<sources>/B.java:1: Fehler: Inkompatible Typen: String kann nicht in int konvertiert werden\nclass B { A a; int y = "text"; }\n                       ^\n2 Fehler\n';
const EXPECTED_EDGES =
  '<output> -> java.base\n   A                                                  -> java.lang.Object                                   java.base\n';

afterAll(() => {
  probe?.dispose();
});

function host() {
  if (probe === undefined) {
    throw new Error('the probe host is only available when NITPICKER_JAVA_E2E=1');
  }
  return probe;
}

function hostKeys(): string[] {
  return readdirSync(path.join(host().work, 'hosts'))
    .filter((name) => name.endsWith(READY))
    .map((name) => name.slice(0, -READY.length));
}

function lines(text: string | undefined): string[] {
  return (text ?? '').split('\n');
}

describe.skipIf(!enabled)('a shared tool JVM', () => {
  it('starts, and answers with the output and exit status of a separate JVM', () => {
    const first = host().run(['echo']);
    const second = host().run(['echo']);

    expect([first?.status, first?.stdout, first?.stderr]).toEqual([0, 'out 1\n', 'err 1\n']);
    expect([second?.status, second?.stdout]).toEqual([0, 'out 2\n']);
  });

  it.each([
    [['exit', '3'], 3],
    [['runtime-exit'], 4],
    [['throw'], 1],
  ])('reports exit status for %j without stopping the host', (args, status) => {
    const result = host().run(args);

    expect([result?.status, host().run(['echo'])?.status]).toEqual([status, 0]);
  });

  it('skips code after System.exit the way a real exit does, apart from finally blocks', () => {
    expect(host().run(['exit', '2'])?.stdout).toBe('finally ran\n');
  });

  it('prints an uncaught exception to stderr', () => {
    expect(lines(host().run(['throw'])?.stderr)[0]).toBe(
      'Exception in thread "main" java.lang.IllegalStateException: boom',
    );
  });

  it('runs the shutdown hooks of the job when it ends', () => {
    expect(host().run(['hook'])?.stdout).toBe('hook ran\n');
  });

  it('sends what a logging framework writes to the error stream to the job that is running', () => {
    const second = lines(host().run(['jul'])?.stderr);
    const third = lines(host().run(['jul'])?.stderr);

    expect(second[1]).toMatch(/^WARNING: jul warning \d+$/u);
    expect(third).toHaveLength(3);
    expect(third[1]).toMatch(/^WARNING: jul warning \d+$/u);
    expect(third[1]).not.toBe(second[1]);
  });

  it('ends the job at once with the status of an exit from another thread', () => {
    expect([host().run(['thread-exit'])?.status, host().run(['echo'])?.status]).toEqual([7, 0]);
  });

  it('does not run shutdown hooks after a halt from another thread', () => {
    const result = host().run(['thread-halt']);

    expect([result?.status, result?.stdout, host().run(['echo'])?.status]).toEqual([9, '', 0]);
  });

  it('gives the threads of the common pool the loader of the tool', () => {
    expect(host().run(['pool'])?.stdout).toBe('true\n');
  });

  it('gives the tool the working directory and starts a separate host for other JVM flags', () => {
    const flagged = host().run(['properties'], undefined, ['-Dprobe.flag=on']);
    const plain = host().run(['properties']);

    expect([flagged?.stdout, plain?.stdout]).toEqual([
      `${host().work} on\n`,
      `${host().work} null\n`,
    ]);
    expect(hostKeys()).toHaveLength(2);
  });

  it('answers a job that is too long as a timed out process, then starts a fresh host', () => {
    const slow = host().run(['sleep', '60000'], 1500);

    expect([slow?.status, Reflect.get(slow?.error ?? {}, 'code')]).toEqual([null, 'ETIMEDOUT']);
    expect(host().run(['echo'])?.stdout).toBe('out 1\n');
  });
});

describe.skipIf(!enabled)('a shared tool JVM that runs a long job', () => {
  beforeAll(() => {
    const worker = new Worker(new URL('./test-support/busy-worker.mts', import.meta.url), {
      workerData: {
        java: javaCommand('java'),
        classpath: [host().classes],
        args: ['sleep', '4000'],
        cwd: host().work,
      },
    });
    worker.unref();
  });

  it('leaves a job to a plain spawn while the host is busy', async () => {
    const directory = path.join(host().work, 'hosts');
    await vi.waitFor(
      () => {
        expect(readdirSync(directory).filter((name) => name.endsWith(BUSY))).toHaveLength(1);
      },
      { timeout: WAIT_MS },
    );

    expect(host().run(['echo'])).toBeUndefined();
    await vi.waitFor(
      () => {
        expect(host().run(['echo'])?.status).toBe(0);
      },
      { timeout: WAIT_MS },
    );
  });
});

describe.skipIf(!enabled)('the shared tool JVMs of a run', () => {
  it('runs javac and jdeps in the host with the output, status and language of the commands', () => {
    const sources = host().temporary('nitpicker-tool-src-');
    const output = host().temporary('nitpicker-tool-out-');
    const report = path.join(output, 'jdeps.txt');
    writeFileSync(path.join(sources, 'A.java'), 'class A { int x = 1; }\n');
    writeFileSync(path.join(sources, 'B.java'), 'class B { A a; int y = "text"; }\n');
    const options = { cwd: host().work, encoding: 'utf8' as const };
    const good = hostedToolSpawn(
      javaCommand('javac'),
      ['-J-Duser.language=en', '-J-Duser.country=US', '-d', output, path.join(sources, 'A.java')],
      options,
    );
    const bad = hostedToolSpawn(
      javaCommand('javac'),
      ['-J-Duser.language=de', '-d', output, '-Xlint:all', path.join(sources, 'B.java')],
      options,
    );
    const edges = hostedToolSpawn(javaCommand('jdeps'), ['-verbose:class', output], {
      ...options,
      stdoutFile: report,
    });

    expect([good.status, good.stderr, bad.status, edges.status]).toEqual([0, '', 1, 0]);
    expect(bad.stderr.replaceAll(sources, '<sources>')).toBe(EXPECTED_ERROR);
    expect(readFileSync(report, 'utf8').replaceAll(path.basename(output), '<output>')).toBe(
      EXPECTED_EDGES,
    );
  });

  it('stops every host when the run ends', async () => {
    const directory = path.join(host().work, 'hosts');
    const keys = hostKeys();
    const pids = keys.map((key) => hostPid(directory, key));
    host().stopHosts();

    expect(keys).toHaveLength(HOSTS_AFTER_TOOLS);
    expect(keys.map((key) => existsSync(hostFile(directory, key, READY)))).toEqual(
      keys.map(() => false),
    );
    await vi.waitFor(
      () => {
        expect(pids.map((pid) => isAlive(pid))).toEqual(pids.map(() => false));
      },
      { timeout: WAIT_MS },
    );
  });
});
