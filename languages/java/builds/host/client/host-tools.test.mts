import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostedToolSpawn, parseArgumentFile } from './host-tools.mts';

const roots: string[] = [];

afterAll(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function fakeJdk(): string {
  const bin = path.join(temporary('nitpicker-hosttools-jdk-'), 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'java'),
    '#!/bin/sh\nif [ "$1" = -version ]; then echo \'openjdk version "21.0.1"\' >&2; exit 0; fi\nexit 1\n',
  );
  writeFileSync(path.join(bin, 'javac'), '#!/bin/sh\necho plain "$@"\n');
  for (const name of ['java', 'javac']) chmodSync(path.join(bin, name), 0o755);
  return bin;
}

function withHosts(): string {
  const directory = path.join(temporary('nitpicker-hosttools-run-'), 'hosts');
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
  writeFileSync(
    path.join(directory, 'config.json'),
    JSON.stringify({ owner: process.pid, classpath: '/none', maxHosts: 4 }),
  );
  vi.stubEnv('NITPICKER_TOOL_HOSTS', directory);
  const trace = path.join(directory, 'trace.log');
  vi.stubEnv('NITPICKER_TOOL_HOSTS_TRACE', trace);
  return trace;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('XDG_CACHE_HOME', temporary('nitpicker-hosttools-cache-'));
});

describe('hostedToolSpawn', () => {
  const cwd = tmpdir();

  it('is a plain spawn when the run set up no hosts', () => {
    const result = hostedToolSpawn(path.join(fakeJdk(), 'javac'), ['-d', '/out'], {
      cwd,
      encoding: 'utf8',
    });

    expect([result.status, result.stdout]).toEqual([0, 'plain -d /out\n']);
  });

  it('spawns the tool itself when the host JVM does not start', () => {
    const trace = withHosts();
    const result = hostedToolSpawn(path.join(fakeJdk(), 'javac'), ['-d', '/out'], {
      cwd,
      encoding: 'utf8',
    });

    expect([result.status, result.stdout]).toEqual([0, 'plain -d /out\n']);
    expect(readFileSync(trace, 'utf8')).toBe('fallback javac\n');
  });

  it('does not try a host for a command that is not a hosted tool', () => {
    const trace = withHosts();
    hostedToolSpawn('echo', ['x'], { cwd, encoding: 'utf8' });

    expect(existsSync(trace)).toBe(false);
  });

  it('does not try a host when the output goes to a descriptor the host cannot write', () => {
    const trace = withHosts();
    hostedToolSpawn(path.join(fakeJdk(), 'javac'), ['-d', '/out'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 1, 'pipe'],
    });

    expect(existsSync(trace)).toBe(false);
  });

  it('does not try a host for an argument file that names a path relative to the directory', () => {
    const trace = withHosts();
    const module = temporary('nitpicker-hosttools-module-');
    mkdirSync(path.join(module, 'src'));
    const argumentFile = path.join(module, 'javac.args');
    writeFileSync(argumentFile, '"src"\n"-d"\n"/out"');
    const result = hostedToolSpawn(path.join(fakeJdk(), 'javac'), [`@${argumentFile}`], {
      cwd: module,
      encoding: 'utf8',
    });

    expect(result.stdout).toBe(`plain @${argumentFile}\n`);
    expect(readFileSync(trace, 'utf8')).toBe('relative javac\n');
  });
});

describe('parseArgumentFile', () => {
  it.each([
    ['-d out\n-cp a:b\n', ['-d', 'out', '-cp', 'a:b']],
    ['"a file with spaces.java" \'single quoted\'', ['a file with spaces.java', 'single quoted']],
    ['"C:\\\\src\\\\A.java" x\\y', ['C:\\src\\A.java', 'x\\y']],
    ['# a comment\n-g\n', ['-g']],
    ['a#b "" c', ['a#b', '', 'c']],
    ['', []],
  ])('splits %j the way javac does', (text, tokens) => {
    expect(parseArgumentFile(text)).toEqual(tokens);
  });

  it('gives up on a quote that never closes', () => {
    expect(parseArgumentFile('"open')).toBeUndefined();
  });
});
