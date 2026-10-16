import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cacheRoot, resolveTools, toolDependencies } from './maven-tools.mjs';

const pinned = {
  pmd: '1',
  spotbugs: '2',
  googleJavaFormat: '3',
  checkstyle: '4',
  jacoco: '5',
  pitest: '6',
  pitestJunit5: '7',
  archunit: '8',
};
const BASE_TOOLS = ['pmd', 'spotbugs', 'format', 'checkstyle', 'jacoco', 'pit'];

let home;
let savedCache;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-tools-'));
  savedCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = home;
});

afterEach(() => {
  if (savedCache === undefined) {
    delete process.env.XDG_CACHE_HOME;
  } else {
    process.env.XDG_CACHE_HOME = savedCache;
  }
  rmSync(home, { recursive: true, force: true });
});

function seedCache(tools) {
  const key = createHash('sha256').update(JSON.stringify(tools)).digest('hex').slice(0, 16);
  const jar = path.join(home, 'tool.jar');
  writeFileSync(jar, '');
  for (const name of Object.keys(tools)) {
    const directory = path.join(home, 'nitpicker', `maven-tools-${key}`, name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'classpath.txt'), jar);
  }
  return jar;
}

describe('toolDependencies', () => {
  it('leaves the ArchUnit jar out unless the build uses Spring', () => {
    expect(Object.keys(toolDependencies(pinned, ['1.11.4']))).toEqual([
      ...BASE_TOOLS,
      'launcher-1.11.4',
    ]);
  });

  it('adds the pinned ArchUnit jar for a Spring build', () => {
    const tools = toolDependencies(pinned, [], { spring: true });

    expect(Object.keys(tools)).toEqual([...BASE_TOOLS, 'archunit']);
    expect(tools.archunit).toEqual([
      '<dependency><groupId>com.tngtech.archunit</groupId><artifactId>archunit</artifactId><version>8</version></dependency>',
    ]);
  });
});

describe('cacheRoot', () => {
  it.skipIf(process.platform === 'win32')('is a private nitpicker directory', () => {
    const root = cacheRoot();

    expect([root, statSync(root).mode & 0o077]).toEqual([path.join(home, 'nitpicker'), 0]);
  });
});

describe('resolveTools', () => {
  it('reads the classpaths cached under maven-tools-<key> in the cache root', () => {
    const jar = seedCache(toolDependencies(pinned, []));

    expect(
      resolveTools({
        projectRoot: home,
        maven: 'unused',
        pinned,
        launcherVersions: [],
        spring: false,
      }),
    ).toEqual(Object.fromEntries(BASE_TOOLS.map((name) => [name, [jar]])));
  });

  it('keys a Spring build separately and includes ArchUnit', () => {
    const jar = seedCache(toolDependencies(pinned, [], { spring: true }));

    expect(
      resolveTools({
        projectRoot: home,
        maven: 'unused',
        pinned,
        launcherVersions: [],
        spring: true,
      }),
    ).toEqual(Object.fromEntries([...BASE_TOOLS, 'archunit'].map((name) => [name, [jar]])));
  });
});
