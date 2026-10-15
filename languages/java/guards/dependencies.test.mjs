import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { dependencyFindings, isFloating, readDependencyFindings } from './dependencies.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const declared = (group, name, version, extra = {}) => ({
  configuration: 'implementation',
  group,
  name,
  version,
  changing: false,
  ...extra,
});

describe('isFloating', () => {
  it.each([
    '2.+',
    '+',
    'latest.release',
    'latest.integration',
    '1.0-SNAPSHOT',
    '[1.0,2.0)',
    '(1.0,2.0]',
  ])('flags %s', (version) => {
    expect(isFloating({ version })).toBe(true);
  });

  it.each(['', '2.10.1', '1.0.0-RC1', '5.13.4'])('accepts %j', (version) => {
    expect(isFloating({ version })).toBe(false);
  });

  it('flags a changing module whatever its version', () => {
    expect(isFloating({ version: '1.0', changing: true })).toBe(true);
  });
});

describe('dependencyFindings', () => {
  it('reports a floating version on the build file with the pin advice', () => {
    const findings = dependencyFindings({
      buildFile: 'build.gradle',
      declared: [declared('com.google.code.gson', 'gson', '2.+', { archives: ['/c/gson.jar'] })],
      referenced: ['/c/gson.jar'],
    });

    expect(findings).toEqual([
      {
        tool: 'dependencies',
        rule: 'dependency-version-not-pinned',
        path: 'build.gradle',
        identity: 'floating:com.google.code.gson:gson:2.+',
        message:
          'Dependency com.google.code.gson:gson has the floating version 2.+, so the build can change without a commit. Pin one exact version. If it is right here, add an exception for dependencies/dependency-version-not-pinned in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('accepts floating versions when the project locks its dependencies', () => {
    const findings = dependencyFindings({
      buildFile: 'build.gradle',
      locked: true,
      declared: [declared('g', 'a', '2.+')],
    });

    expect(findings).toEqual([]);
  });

  it('reports a main dependency no class reaches, and leaves the others alone', () => {
    const findings = dependencyFindings({
      buildFile: 'app/build.gradle.kts',
      declared: [
        declared('org.apache.commons', 'commons-lang3', '3.14.0', { archives: ['/c/lang.jar'] }),
        declared('com.google.guava', 'guava', '33.0.0', {
          archives: ['/c/guava.jar', '/c/failureaccess.jar'],
        }),
        declared('org.springframework.boot', 'spring-boot-starter-actuator', '', {
          archives: ['/c/actuator.jar'],
        }),
        declared('org.junit', 'junit-bom', '5.13.4', { archives: [] }),
        declared('org.mockito', 'mockito-core', '5.19.0', { configuration: 'testImplementation' }),
      ],
      referenced: ['java.base', '/c/guava.jar'],
    });

    expect(findings).toEqual([
      {
        tool: 'dependencies',
        rule: 'unused-declared-dependency',
        path: 'app/build.gradle.kts',
        identity: 'unused:org.apache.commons:commons-lang3',
        classification: 'enforceable',
        message:
          'Dependency org.apache.commons:commons-lang3 is declared in implementation but no main class uses it. ' +
          'Remove it, or declare it runtimeOnly if it is only needed at run time. ' +
          'If it is right here, add an exception for dependencies/unused-declared-dependency in nitpicker.config.json.',
      },
    ]);
  });

  it('reports a dependency declared in two configurations once', () => {
    const findings = dependencyFindings({
      declared: [declared('g', 'a', '2.+'), declared('g', 'a', '2.+', { configuration: 'api' })],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('build.gradle');
  });
});

describe('readDependencyFindings', () => {
  it('reads dependencies.json and tolerates its absence', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dependencies-'));
    roots.push(root);
    expect(readDependencyFindings(root)).toEqual([]);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      path.join(root, 'dependencies.json'),
      JSON.stringify({
        buildFile: 'build.gradle',
        declared: [declared('g', 'a', 'latest.release')],
      }),
    );

    expect(readDependencyFindings(root).map((finding) => finding.rule)).toEqual([
      'dependency-version-not-pinned',
    ]);
  });
});
