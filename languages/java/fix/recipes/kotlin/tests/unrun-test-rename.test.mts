import { describe, expect, it } from 'vitest';
import { applyProject } from '../test-support/apply-project.mts';
import { kotlinUnrunTestRenameRecipe } from './unrun-test-rename.mts';

const POM = { 'pom.xml': '<project><artifactId>demo</artifactId></project>\n' };
const IT = 'src/test/kotlin/demo/OrderIT.kt';
const RENAMED = 'src/test/kotlin/demo/OrderTest.kt';
const SOURCE = [
  'package demo',
  '',
  'import org.junit.jupiter.api.Test',
  '',
  'class OrderIT {',
  '    @Test',
  '    fun places() { }',
  '}',
  '',
].join('\n');
const fix = (
  files: Record<string, string>,
  build: Record<string, string> = POM,
): Record<string, string> => applyProject(kotlinUnrunTestRenameRecipe, files, build);

describe('kotlinUnrunTestRenameRecipe', () => {
  it('renames an IT test class and its file so Surefire collects it', () => {
    expect(fix({ [IT]: SOURCE })).toEqual({ [RENAMED]: SOURCE.replace('OrderIT', 'OrderTest') });
    expect(
      fix({ 'src/test/kotlin/demo/ITOrderCase.kt': SOURCE.replace('OrderIT', 'ITOrderCase') }),
    ).toEqual({
      'src/test/kotlin/demo/OrderCaseTest.kt': SOURCE.replace('OrderIT', 'OrderCaseTest'),
    });
  });
  it('renames inside a module of a multi-module build', () => {
    const files = { [`core/${IT}`]: SOURCE };

    expect(fix(files, { 'core/pom.xml': '<project/>\n', ...POM })).toEqual({
      [`core/${RENAMED}`]: SOURCE.replace('OrderIT', 'OrderTest'),
    });
  });
  it('leaves a class when Failsafe or Surefire is configured, Gradle builds, or the name is taken', () => {
    const failsafe = { 'pom.xml': '<project>maven-failsafe-plugin</project>\n' };
    const gradle = { ...POM, 'build.gradle': 'plugins { id("java") }\n' };

    expect([
      fix({ [IT]: SOURCE }, failsafe),
      fix({ [IT]: SOURCE }, gradle),
      fix({ [IT]: SOURCE }, {}),
      fix({ [IT]: SOURCE, [RENAMED]: 'package demo\n' }),
      fix({ [IT]: SOURCE, 'src/test/kotlin/demo/Other.kt': 'package demo\n\nval x = OrderIT()\n' }),
    ]).toEqual([
      { [IT]: SOURCE },
      { [IT]: SOURCE },
      { [IT]: SOURCE },
      { [IT]: SOURCE, [RENAMED]: 'package demo\n' },
      { [IT]: SOURCE, 'src/test/kotlin/demo/Other.kt': 'package demo\n\nval x = OrderIT()\n' },
    ]);
  });
  it('leaves classes without tests, abstract classes and ordinary names alone', () => {
    const plain = SOURCE.replace('OrderIT', 'OrderTest');
    const noTests = 'package demo\n\nclass OrderIT {\n    fun helper() { }\n}\n';
    const abstract = SOURCE.replace('class OrderIT', 'abstract class OrderIT');

    expect(fix({ [RENAMED]: plain, [IT]: noTests })).toEqual({ [RENAMED]: plain, [IT]: noTests });
    expect(fix({ [IT]: abstract })).toEqual({ [IT]: abstract });
  });
  it('leaves a class whose new name is declared elsewhere or whose name is in a string', () => {
    const declared = 'package demo\n\nclass OrderTest\n';
    const reflective = SOURCE.replace(
      'fun places() { }',
      'fun places() { Class.forName("demo.OrderIT") }',
    );
    const unchanged = {
      [IT]: SOURCE,
      'src/test/java/demo/Suite.java': 'class Suite { Class<?> c = OrderIT.class; }\n',
    };

    expect([
      fix({ [IT]: SOURCE, 'src/test/kotlin/demo/Other.kt': declared }),
      fix({ [IT]: reflective }),
      applyProject(kotlinUnrunTestRenameRecipe, unchanged, POM, [IT]),
    ]).toEqual([
      { [IT]: SOURCE, 'src/test/kotlin/demo/Other.kt': declared },
      { [IT]: reflective },
      unchanged,
    ]);
  });
  it('declines when an unchanged OrderTest.kt already exists', () => {
    const files = { [IT]: SOURCE, [RENAMED]: 'package demo\n' };

    expect(applyProject(kotlinUnrunTestRenameRecipe, files, POM, [IT])).toEqual(files);
  });
  it('leaves a name that Surefire already collects', () => {
    const files = { 'src/test/kotlin/demo/ITEMTest.kt': SOURCE.replace('OrderIT', 'ITEMTest') };

    expect(fix(files)).toEqual(files);
  });
});
