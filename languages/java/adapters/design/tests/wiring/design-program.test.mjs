import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileDesignProgram, runDesignProgram } from '../../producer/design-program.mjs';

const VERSION = { status: 0, stdout: '', stderr: 'openjdk version "21"' };
const work = [];

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

function fakeSpawn(run) {
  const launches = [];
  function spawn(command, args) {
    if (args[0] === '-version') {
      return VERSION;
    }
    const tokens = readFileSync(args[0].slice(1), 'utf8').split('\n');
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
    const spawn = () => ({ error: new Error('spawn javac ENOENT') });

    expect(() => compileDesignProgram({ sources: sources(), cache: folder(), spawn })).toThrow(
      new Error(
        'DesignFacts needs a JDK, but javac could not run: spawn javac ENOENT. Set JAVA_HOME to a JDK',
      ),
    );
  });

  it('reports a javac failure and leaves nothing in the cache', () => {
    const cache = folder();
    const { spawn } = fakeSpawn(() => ({ status: 1, stdout: '', stderr: 'Tool.java:1: error' }));

    expect(() => compileDesignProgram({ sources: sources(), cache, spawn })).toThrow(
      new Error('DesignFacts failed with exit code 1: Tool.java:1: error'),
    );
    expect(readdirSync(cache)).toEqual([]);
  });

  it('compiles once and reuses the cached classes for the same sources and JDK', () => {
    const cache = folder();
    const files = sources();
    const { launches, spawn } = fakeSpawn(() => ({ status: 0, stdout: '', stderr: '' }));

    const first = compileDesignProgram({ sources: files, cache, spawn });
    const second = compileDesignProgram({ sources: files, cache, spawn });

    expect([second, readdirSync(cache), launches.map(({ command }) => command)]).toEqual([
      first,
      [path.basename(first)],
      ['javac'],
    ]);
  });

  it('starts the program with a larger thread stack for deeply nested sources', () => {
    const { launches, spawn } = fakeSpawn(() => ({ status: 0, stdout: '', stderr: '' }));

    runDesignProgram({
      classes: '/classes',
      projectRoot: folder(),
      fileList: '/files.txt',
      output: '/out.json',
      spawn,
    });

    expect(launches.map(({ tokens }) => tokens.slice(0, 4))).toEqual([
      ['"-Xss32m"', '"-cp"', '"/classes"', '"nitpicker.designfacts.DesignFacts"'],
    ]);
  });
});
