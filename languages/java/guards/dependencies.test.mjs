import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { dependencyFindings, readDependencyFindings } from './dependencies.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const declared = (group, name, extra = {}) => ({
  configuration: 'implementation',
  group,
  name,
  archives: [`${name}.jar`],
  used: false,
  ...extra,
});

const UNUSED_LANG = {
  tool: 'dependencies',
  rule: 'unused-declared-dependency',
  path: 'app/build.gradle.kts',
  identity: 'unused:org.apache.commons:commons-lang3',
  classification: 'enforceable',
  message:
    'Dependency org.apache.commons:commons-lang3 is declared in implementation but no main class uses it. ' +
    'Remove it, declare it runtimeOnly if it is only needed at run time, ' +
    'or compileOnly if only its source annotations are needed. ' +
    'If it is right here, add an exception for dependencies/unused-declared-dependency in nitpicker.config.json.',
};

describe('dependencyFindings', () => {
  it('reports a main dependency no class reaches, and leaves the others alone', () => {
    const findings = dependencyFindings({
      buildFile: 'app/build.gradle.kts',
      analyzed: true,
      declared: [
        declared('org.apache.commons', 'commons-lang3'),
        declared('com.google.guava', 'guava', { used: true }),
        declared('org.springframework.boot', 'spring-boot-starter-actuator'),
        declared('org.junit', 'junit-bom', { archives: [] }),
      ],
    });

    expect(findings).toEqual([UNUSED_LANG]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('reports a dependency declared in two configurations once', () => {
    const findings = dependencyFindings({
      analyzed: true,
      declared: [declared('g', 'a'), declared('g', 'a', { configuration: 'api' })],
    });

    expect(findings.map((finding) => [finding.identity, finding.path])).toEqual([
      ['unused:g:a', 'build.gradle'],
    ]);
  });

  it('names the Maven scopes on a Maven build', () => {
    const findings = dependencyFindings({
      build: 'maven',
      analyzed: true,
      declared: [declared('g', 'a', { configuration: 'compile' })],
    });

    expect(findings.map(({ path: file, message }) => [file, message])).toEqual([
      [
        'pom.xml',
        'Dependency g:a has compile scope but no main class uses it. ' +
          'Remove it, give it test scope if only the tests use it, runtime scope if it is only needed at run time, ' +
          'or provided scope if only its source annotations are needed. ' +
          'If it is right here, add an exception for dependencies/unused-declared-dependency in nitpicker.config.json.',
      ],
    ]);
  });

  it('says nothing when the project has no main classes to compare with', () => {
    expect(dependencyFindings({ analyzed: false, declared: [declared('g', 'a')] })).toEqual([]);
  });
});

describe('readDependencyFindings', () => {
  it('reads dependencies.json and tolerates its absence', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dependencies-'));
    roots.push(root);
    expect(readDependencyFindings(root)).toEqual([]);
    writeFileSync(
      path.join(root, 'dependencies.json'),
      JSON.stringify({
        buildFile: 'app/build.gradle.kts',
        analyzed: true,
        declared: [declared('org.apache.commons', 'commons-lang3')],
      }),
    );

    expect(readDependencyFindings(root)).toEqual([UNUSED_LANG]);
  });
});
