import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileDesignProgram, runDesignProgram } from '../../producer/design-program.mts';

type Launch = { readonly command: string; readonly tokens: string[] };

function spawned(fields: {
  status?: number;
  stdout?: string;
  stderr?: string;
  error?: Error;
}): SpawnSyncReturns<string> {
  return {
    pid: 0,
    output: [],
    signal: null,
    status: fields.status ?? null,
    stdout: fields.stdout ?? '',
    stderr: fields.stderr ?? '',
    ...(fields.error === undefined ? {} : { error: fields.error }),
  };
}

const VERSION = spawned({ status: 0, stderr: 'openjdk version "21"' });
const work: string[] = [];

function folder() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-program-'));
  work.push(root);
  return root;
}

function sources() {
  const root = folder();
  const source = path.join(root, 'Tool.java');
  writeFileSync(source, 'class Tool {}\n');
  return [source];
}

function fakeSpawn(run: () => SpawnSyncReturns<string>) {
  const launches: Launch[] = [];
  function spawn(command: string, args: readonly string[]): SpawnSyncReturns<string> {
    if (args[0] === '-version') {
      return VERSION;
    }
    const tokens = readFileSync((args[0] ?? '').slice(1), 'utf8').split('\n');
    launches.push({ command: path.basename(command), tokens });
    return run();
  }
  return { launches, spawn };
}

afterEach(() => {
  for (const root of work.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('the design facts program', () => {
  it('asks for a JDK when javac cannot be started', () => {
    const spawn = () => spawned({ error: new Error('spawn javac ENOENT') });

    expect(() => compileDesignProgram({ sources: sources(), cache: folder(), spawn })).toThrow(
      new Error(
        'DesignFacts needs a JDK, but javac could not run: spawn javac ENOENT. Set JAVA_HOME to a JDK',
      ),
    );
  });

  it('reports a javac failure and leaves nothing in the cache', () => {
    const cache = folder();
    const { spawn } = fakeSpawn(() => spawned({ status: 1, stderr: 'Tool.java:1: error' }));

    expect(() => compileDesignProgram({ sources: sources(), cache, spawn })).toThrow(
      new Error('DesignFacts failed with exit code 1: Tool.java:1: error'),
    );
    expect(readdirSync(cache)).toEqual([]);
  });

  it('compiles once and reuses the cached classes for the same sources and JDK', () => {
    const cache = folder();
    const files = sources();
    const { launches, spawn } = fakeSpawn(() => spawned({ status: 0 }));

    const first = compileDesignProgram({ sources: files, cache, spawn });
    const second = compileDesignProgram({ sources: files, cache, spawn });

    expect([second, readdirSync(cache), launches.map(({ command }) => command)]).toEqual([
      first,
      [path.basename(first)],
      ['javac'],
    ]);
  });

  it('compiles the program for Java 21, so a newer javac still builds classes an older JDK runs', () => {
    const { launches, spawn } = fakeSpawn(() => spawned({ status: 0 }));

    compileDesignProgram({ sources: sources(), cache: folder(), spawn });

    expect(launches.map(({ tokens }) => tokens.slice(0, 2))).toEqual([['"--release"', '"21"']]);
  });

  it('starts the program on the JDK the sources compile with when the build names one', () => {
    const commands: string[] = [];
    const spawn = (command: string) => {
      commands.push(command);
      return spawned({ status: 0 });
    };

    runDesignProgram({
      classes: '/classes',
      projectRoot: folder(),
      fileList: '/files.txt',
      output: '/out.json',
      java: '/jdk25/bin/java',
      spawn,
    });

    expect(commands).toEqual(['/jdk25/bin/java']);
  });

  it('starts the program with a larger thread stack for deeply nested sources', () => {
    const { launches, spawn } = fakeSpawn(() => spawned({ status: 0 }));

    runDesignProgram({
      classes: '/classes',
      projectRoot: folder(),
      fileList: '/files.txt',
      output: '/out.json',
      java: undefined,
      spawn,
    });

    expect(launches.map(({ tokens }) => tokens.slice(0, 4))).toEqual([
      ['"-Xss32m"', '"-cp"', '"/classes"', '"nitpicker.designfacts.DesignFacts"'],
    ]);
  });
});
