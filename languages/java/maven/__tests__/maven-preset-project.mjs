import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { testCasesOf } from '../../adapters/test-times/slow-tests.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.join(path.resolve(import.meta.dirname, '..'), 'fixtures');
const gradleFixture = path.join(
  path.resolve(import.meta.dirname, '..'),
  '../adapters/fixtures/gradle-project',
);
const temporary = [];
const DATED = `package demo;

import java.util.Date;

public class Dated {
    public Date now(int a, int b, int c, int d) {
        if (a > 0) { if (b > 0) { if (c > 0) { if (d > 0) { return new Date(); } } } }
        try { Integer.parseInt("x"); } catch (NumberFormatException e) { }
        return new Date(new String(new byte[] {1}).length());
    }

    public String shout(String text) {
        if (text.isEmpty()) return text;
        return text.toUpperCase();
    }
}
`;
const EMPTY_CATCH = `package demo.app;

public final class Parser {
  public int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
    }
    return 0;
  }
}
`;
const FAILING_TEST = `package demo.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AdderTest {
  @Test
  void adds() {
    assertEquals(4, new Adder().add(1, 2));
  }
}
`;
function copyOf(...sources) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-e2e-'));
  temporary.push(root);
  for (const source of sources) {
    cpSync(source, root, { recursive: true });
  }
  return root;
}
function twinProjects() {
  const gradleProject = copyOf(gradleFixture);
  const mavenProject = copyOf(gradleFixture, path.join(fixtures, 'single'));
  for (const name of ['build.gradle', 'settings.gradle']) {
    rmSync(path.join(mavenProject, name));
  }
  return [gradleProject, mavenProject];
}
function copiedTestCases(project) {
  const results = path.join(project, 'target/nitpicker/test-results');
  return readdirSync(results)
    .sort()
    .flatMap((task) =>
      readdirSync(path.join(results, task))
        .sort()
        .flatMap((name) => testCasesOf(readFileSync(path.join(results, task, name), 'utf8'), task)),
    );
}
function lineCoverage(text, value) {
  return {
    tool: 'jacoco',
    rule: 'line-coverage',
    path: 'src/main/java/demo/Greeter.java',
    identity: 'line-coverage',
    metric: { name: 'line-coverage', value },
    message: `line-coverage ${text}`,
    classification: 'descriptive',
  };
}
const comparable = (findings) => findings.map((finding) => JSON.stringify(finding)).sort();
// Register cleanup separately in each isolated test file.
export function useMavenPresetProject() {
  afterAll(() => {
    for (const root of temporary.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
export {
  enabled,
  gradle,
  maven,
  fixtures,
  DATED,
  EMPTY_CATCH,
  FAILING_TEST,
  copyOf,
  twinProjects,
  copiedTestCases,
  lineCoverage,
  comparable,
};
