import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheRoot, toolDependencies } from '../maven-tools.mjs';
import {
  archRulesArguments,
  argumentFileText,
  javacArguments,
  runSpringArch,
  springArchCacheKey,
} from './maven-spring-arch.mjs';

const roots = [];

function temporary() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-unit-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('springArchCacheKey', () => {
  const base = {
    sources: [Buffer.from('class A {}'), Buffer.from('class B {}')],
    archunit: '1.5.1',
    jdk: 'Eclipse Adoptium|21.0.4',
  };

  it('hashes the rule sources, then the ArchUnit version and the JDK, as the Gradle task does', () => {
    const expected = createHash('sha256')
      .update('class A {}')
      .update('class B {}')
      .update('1.5.1|Eclipse Adoptium|21.0.4')
      .digest('hex');

    expect(springArchCacheKey(base)).toBe(expected);
  });

  it('changes with each of its inputs', () => {
    const keys = [
      base,
      { ...base, sources: [Buffer.from('class A {}'), Buffer.from('class C {}')] },
      { ...base, sources: [base.sources[1], base.sources[0]] },
      { ...base, archunit: '1.5.2' },
      { ...base, jdk: 'Eclipse Adoptium|21.0.5' },
    ].map(springArchCacheKey);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('argument construction', () => {
  it('writes one quoted class path with duplicates removed and backslashes doubled', () => {
    const first = path.resolve('libs', 'a.jar');
    const second = path.resolve('libs', 'b.jar');

    expect(argumentFileText([first, second, first])).toBe(
      `-cp\n"${[first, second].join(path.delimiter).replaceAll('\\', '\\\\')}"\n`,
    );
  });

  it('passes the report and both class directory lists to ArchRules', () => {
    expect(
      archRulesArguments({
        output: '/m/target/nitpicker/spring-arch.json',
        mainClasses: ['/m/target/classes', '/m/other'],
        testClasses: [],
      }),
    ).toEqual([
      'ArchRules',
      '/m/target/nitpicker/spring-arch.json',
      ['/m/target/classes', '/m/other'].join(path.delimiter),
      '',
    ]);
  });

  it('compiles the rule sources without annotation processing into the staging directory', () => {
    expect(
      javacArguments({
        staging: '/cache/x.1',
        argumentFile: '/r/compile.args',
        sources: ['A.java'],
      }),
    ).toEqual(['-proc:none', '-nowarn', '-d', '/cache/x.1', '@/r/compile.args', 'A.java']);
  });
});

describe('runSpringArch', () => {
  it('does nothing for a module that does not use Spring', () => {
    const reportDir = temporary();

    runSpringArch({ module: {}, reportDir, tools: {}, classpaths: {}, pinned: {}, spring: false });

    expect(readdirSync(reportDir)).toEqual([]);
  });
});

describe('cacheRoot', () => {
  it.skipIf(process.platform === 'win32')(
    'is a private nitpicker directory under XDG_CACHE_HOME',
    () => {
      const home = temporary();
      const saved = process.env.XDG_CACHE_HOME;
      process.env.XDG_CACHE_HOME = home;
      try {
        const root = cacheRoot();

        expect(root).toBe(path.join(home, 'nitpicker'));
        expect(existsSync(root)).toBe(true);
        expect(statSync(root).mode & 0o077).toBe(0);
      } finally {
        if (saved === undefined) {
          delete process.env.XDG_CACHE_HOME;
        } else {
          process.env.XDG_CACHE_HOME = saved;
        }
      }
    },
  );
});

describe('toolDependencies', () => {
  it('resolves the pinned ArchUnit version for the Spring architecture rules', () => {
    const { archunit } = toolDependencies({ archunit: '1.5.1' });

    expect(archunit).toEqual([
      '<dependency><groupId>com.tngtech.archunit</groupId><artifactId>archunit</artifactId><version>1.5.1</version></dependency>',
    ]);
  });
});
