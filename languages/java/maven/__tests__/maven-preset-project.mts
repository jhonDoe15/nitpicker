import { DATED, EMPTY_CATCH, FAILING_TEST } from '../test-support/maven-e2e-sources.mjs';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { testCasesOf as untypedTestCasesOf } from '../../adapters/test-times/slow-tests.mjs';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const maven = process.env['NITPICKER_MAVEN'];
const fixtures = path.join(path.resolve(import.meta.dirname, '..'), 'fixtures');
const gradleFixture = path.join(
  path.resolve(import.meta.dirname, '..'),
  '../adapters/fixtures/gradle-project',
);
const testCasesOf: (xml: string, task: string) => unknown[] = untypedTestCasesOf;
const temporary: string[] = [];
const SHAPES = `package demo;

public final class Shapes {
    private Shapes() {}

    public sealed interface Shape permits Circle, Square {}

    public record Circle(int radius) implements Shape {}

    public record Square(int side) implements Shape {}

    public enum Tone { LOW, HIGH }

    public interface Writer {
        String write(String text);
    }

    public static int area(Shape shape) {
        return switch (shape) {
            case Circle circle -> 3 * circle.radius() * circle.radius();
            case Square square -> square.side() * square.side();
        };
    }

    public static String name(Tone tone) {
        return switch (tone) {
            case LOW -> "low";
            case HIGH -> "high";
        };
    }

    public static String send(Writer writer, String text) {
        return writer.write(text);
    }
}
`;
const SHAPES_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ShapesTest {
    @Test
    void takesEveryCase() {
        assertEquals(3, Shapes.area(new Shapes.Circle(1)));
        assertEquals(4, Shapes.area(new Shapes.Square(2)));
        assertEquals("low", Shapes.name(Shapes.Tone.LOW));
        assertEquals("high", Shapes.name(Shapes.Tone.HIGH));
        assertEquals("a", Shapes.send(text -> text, "a"));
    }
}
`;
const GUARD = `package demo;

public final class Guard {
    public int share(int total, int parts) {
        if (parts == 0) {
            throw new IllegalArgumentException("parts must not be zero");
        }
        return total / parts;
    }

    public String label(String raw) {
        return raw.trim();
    }
}
`;
const GUARD_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GuardTest {
    @Test
    void sharesTotals() {
        assertEquals(3, new Guard().share(6, 2));
        assertEquals("a", new Guard().label("a"));
    }
}
`;
function copyOf(...sources: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-e2e-'));
  temporary.push(root);
  for (const source of sources) {
    cpSync(source, root, { recursive: true });
  }
  return root;
}
function twinProjects(): [string, string] {
  const gradleProject = copyOf(gradleFixture);
  const mavenProject = copyOf(gradleFixture, path.join(fixtures, 'single'));
  for (const name of ['build.gradle', 'settings.gradle']) {
    rmSync(path.join(mavenProject, name));
  }
  return [gradleProject, mavenProject];
}
function copiedTestCases(project: string): unknown[] {
  const results = path.join(project, 'target/nitpicker/test-results');
  return readdirSync(results)
    .sort()
    .flatMap((task) =>
      readdirSync(path.join(results, task))
        .sort()
        .flatMap((name) => testCasesOf(readFileSync(path.join(results, task, name), 'utf8'), task)),
    );
}
function lineCoverage(text: string, value: number): Readonly<Record<string, unknown>> {
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
function comparable(findings: readonly unknown[]): string[] {
  return findings.map((finding) => JSON.stringify(finding)).sort();
}
export function useMavenPresetProject(): void {
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
  GUARD,
  GUARD_TEST,
  SHAPES,
  SHAPES_TEST,
  copyOf,
  twinProjects,
  copiedTestCases,
  lineCoverage,
  comparable,
};
