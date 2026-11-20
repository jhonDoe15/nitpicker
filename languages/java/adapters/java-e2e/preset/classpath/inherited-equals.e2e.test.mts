import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../java-diff.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const maven = process.env['NITPICKER_MAVEN'];
const javaRoot = path.resolve(import.meta.dirname, '../../../..');
const GRADLE_FIXTURE = path.join(javaRoot, 'adapters/fixtures/multi-project');
const MAVEN_FIXTURE = path.join(javaRoot, 'maven/fixtures/multi-module');
const RULE = 'EQ_DOESNT_OVERRIDE_EQUALS';
const temporary: string[] = [];

const usage = (pkg: string): string => `package ${pkg};

import java.util.Objects;

public class Usage {
  private final int input;
  private final int output;

  public Usage(int input, int output) {
    this.input = input;
    this.output = output;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) {
      return true;
    }
    if (other == null || getClass() != other.getClass()) {
      return false;
    }
    Usage that = (Usage) other;
    return input == that.input && output == that.output;
  }

  @Override
  public int hashCode() {
    return Objects.hash(input, output);
  }
}
`;

const subclass = (
  pkg: string,
  base: string,
  name: string,
  equals: string,
): string => `package ${pkg};

import ${base}.Usage;
import java.util.Objects;

public class ${name} extends Usage {
  private final Integer cached;

  public ${name}(int input, int output, Integer cached) {
    super(input, output);
    this.cached = cached;
  }

  public Integer cached() {
    return cached;
  }
${equals}}
`;

const STRICT_EQUALS = `
  @Override
  public boolean equals(Object other) {
    return super.equals(other) && Objects.equals(cached, ((Strict) other).cached);
  }
`;

const BOTH = `
  @Override
  public boolean equals(Object other) {
    return super.equals(other) && Objects.equals(cached, ((Matched) other).cached);
  }

  @Override
  public int hashCode() {
    return Objects.hash(super.hashCode(), cached);
  }
`;

function projectWith(fixture: string, roots: { base: string; app: string }): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-inherited-equals-'));
  temporary.push(root);
  cpSync(fixture, root, { recursive: true });
  const write = (relative: string, text: string): void => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  };
  const appPackage = `${roots.app}/src/main/java/demo/usage`;
  write(`${roots.base}/src/main/java/demo/values/Usage.java`, usage('demo.values'));
  write(`${appPackage}/Cached.java`, subclass('demo.usage', 'demo.values', 'Cached', ''));
  write(
    `${appPackage}/Strict.java`,
    subclass('demo.usage', 'demo.values', 'Strict', STRICT_EQUALS),
  );
  write(`${appPackage}/Matched.java`, subclass('demo.usage', 'demo.values', 'Matched', BOTH));
  return root;
}

function inheritedEquals(findings: readonly { tool: string; rule: string; path: string }[]) {
  return findings
    .filter(({ tool, rule }) => tool === 'spotbugs' && rule === RULE)
    .map(({ rule, path: file }) => `${rule} ${path.basename(file)}`)
    .sort();
}

const EXPECTED = [`${RULE} Cached.java`];

describe.skipIf(!enabled)('a subclass in one module of a value class from another', () => {
  afterAll(() => {
    for (const directory of temporary) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reports the subclass that inherits equals on Gradle', () => {
    const project = projectWith(GRADLE_FIXTURE, { base: 'lib', app: 'app' });
    const findings = collectJavaFindings(project, { gradle, policy: {} });

    expect(inheritedEquals(findings)).toEqual(EXPECTED);
  }, 180_000);

  it('reports the subclass that inherits equals on Maven', () => {
    const project = projectWith(MAVEN_FIXTURE, { base: 'core', app: 'app' });
    const findings = collectJavaFindings(project, { maven, policy: {} });

    expect(inheritedEquals(findings)).toEqual(EXPECTED);
  }, 180_000);
});
