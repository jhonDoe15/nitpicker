import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compiledProgram } from './helper-programs.mjs';

const roots = [];

afterAll(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporary(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function tokensOf(argumentFile) {
  return readFileSync(argumentFile, 'utf8')
    .split('\n')
    .map((token) => token.replace(/^"(.*)"$/su, '$1'));
}

function fakeJdk({ version = '21.0.4', compiles = true } = {}) {
  const compilations = [];
  const spawn = (command, args) => {
    if (args[0] === '-XshowSettings:properties') {
      return {
        status: 0,
        stdout: '',
        stderr: `Property settings:\n    java.vendor = Acme\n    java.version = ${version}\n`,
      };
    }
    const tokens = tokensOf(args[0].slice(1));
    compilations.push(tokens);
    if (!compiles) {
      return { status: 1, stdout: '', stderr: 'Engine.java:1: error: broken' };
    }
    const output = tokens[tokens.indexOf('-d') + 1];
    writeFileSync(path.join(output, 'Engine.class'), 'compiled');
    return { status: 0, stdout: '', stderr: '' };
  };
  return { spawn, compilations };
}

function sources(text = 'class Engine {}') {
  const root = temporary('nitpicker-programs-src-');
  mkdirSync(path.join(root, 'flow'), { recursive: true });
  writeFileSync(path.join(root, 'flow', 'Engine.java'), text);
  return { root, files: [path.join(root, 'flow', 'Engine.java')] };
}

function compile(jdk, program, overrides = {}) {
  return compiledProgram({
    tool: 'The effects engine',
    name: 'effects',
    sources: program.files,
    version: '9.9',
    root: program.root,
    libraries: [],
    cwd: program.root,
    spawn: jdk.spawn,
    ...overrides,
  });
}

describe('compiledProgram', () => {
  beforeEach(() => {
    vi.stubEnv('XDG_CACHE_HOME', temporary('nitpicker-programs-cache-'));
  });

  it('compiles once into a staged folder, publishes it under the source hash and reuses it', () => {
    const jdk = fakeJdk();
    const program = sources();

    const first = compile(jdk, program, { release: 17 });
    const second = compile(jdk, program, { release: 17 });

    expect(second).toBe(first);
    expect(jdk.compilations).toHaveLength(1);
    const tokens = jdk.compilations[0];
    expect(tokens.slice(tokens.indexOf('--release'), tokens.indexOf('--release') + 2)).toEqual([
      '--release',
      '17',
    ]);
    expect(readdirSync(path.dirname(first))).toEqual([path.basename(first)]);
    expect(existsSync(path.join(first, 'Engine.class'))).toBe(true);
  });

  it('keys the cache on the sources, the library version, the JDK and the release', () => {
    const program = sources();
    const base = compile(fakeJdk(), program);
    const keys = [
      compile(fakeJdk(), sources('class Engine { int changed; }')),
      compile(fakeJdk(), program, { version: '9.8' }),
      compile(fakeJdk({ version: '25.0.1' }), program),
      compile(fakeJdk(), program, { release: 17 }),
    ].map((classes) => path.basename(classes));

    expect(new Set([path.basename(base), ...keys]).size).toBe(5);
  });

  it('asks for a newer JDK before compiling, and leaves no staging folder after a failed compile', () => {
    const program = sources();
    const old = fakeJdk({ version: '11.0.2' });
    const legacy = fakeJdk({ version: '1.8.0_392' });
    const broken = fakeJdk({ compiles: false });

    expect(() => compile(old, program, { release: 17 })).toThrow(
      'The effects engine needs JDK 17 or newer, but java reports 11.0.2',
    );
    expect(() => compile(legacy, program, { release: 17 })).toThrow(/java reports 1\.8\.0_392/u);
    expect(old.compilations).toEqual([]);
    expect(() => compile(broken, program)).toThrow(/broken/u);
    expect(readdirSync(path.join(process.env.XDG_CACHE_HOME, 'nitpicker', 'effects'))).toEqual([]);
  });
});
