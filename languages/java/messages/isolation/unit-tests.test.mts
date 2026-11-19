import { describe, expect, it } from 'vitest';
import { NETWORK_RULE, dropNetworkInIntegrationTests } from './unit-tests.mts';
import { temporaryProjectMaker } from '../../__tests__/temporary-roots.mts';

const TEST_ROOTS = ['src/test/java', 'src/integrationTest/java'];

const projectWith = temporaryProjectMaker('nitpicker-unit-tests-');

function finding(
  file: string,
  rule = NETWORK_RULE,
): { tool: string; rule: string; path: string; location: { line: number } } {
  return { tool: 'pmd', rule, path: file, location: { line: 1 } };
}

function kept(files: Record<string, string>, findings: ReturnType<typeof finding>[]): string[] {
  const projectRoot = projectWith(files);
  return dropNetworkInIntegrationTests(findings, { projectRoot, testRoots: TEST_ROOTS }).map(
    ({ path: file, rule }) => `${file} ${rule}`,
  );
}

describe('dropNetworkInIntegrationTests', () => {
  it('keeps network findings in unit tests and drops them where the slow-test check sees integration tests', () => {
    const files = {
      'src/test/java/shop/CartTest.java': 'package shop;\n\nclass CartTest {}\n',
      'src/test/java/shop/CartIT.java': 'package shop;\n\nclass CartIT {}\n',
      'src/test/java/shop/CartIntegrationTests.java':
        'package shop;\n\nclass CartIntegrationTests {}\n',
      'src/test/java/shop/integration/StockTest.java':
        'package shop.integration;\n\nclass StockTest {}\n',
      'src/integrationTest/java/shop/StockTest.java': 'package shop;\n\nclass StockTest {}\n',
      'src/test/kotlin/shop/Specs.kt': 'package shop\n\nclass PricesIntegrationSpec\n',
    };

    expect(
      kept(
        files,
        Object.keys(files).map((file) => finding(file)),
      ),
    ).toEqual(['src/test/java/shop/CartTest.java NetworkInTest']);
  });

  it('treats a test whose class or base class is a @SpringBootTest as an integration test', () => {
    const files = {
      'src/test/java/shop/BootTest.java': 'package shop;\n\n@SpringBootTest\nclass BootTest {}\n',
      'src/test/java/shop/CheckoutTest.java':
        'package shop;\n\nclass CheckoutTest extends ApplicationTestBase {}\n',
      'src/test/java/shop/ApplicationTestBase.java':
        'package shop;\n\n@SpringBootTest\nabstract class ApplicationTestBase {}\n',
      'src/test/java/shop/PlainTest.java': 'package shop;\n\nclass PlainTest {}\n',
    };

    expect(
      kept(
        files,
        Object.keys(files).map((file) => finding(file)),
      ),
    ).toEqual(['src/test/java/shop/PlainTest.java NetworkInTest']);
  });

  it('keeps Kotlin Multiplatform unit test source sets and reads class names outside comments', () => {
    const files = {
      'src/desktopTest/kotlin/shop/CartTest.kt': 'package shop\n\nclass CartTest\n',
      'src/androidUnitTest/kotlin/shop/CartTest.kt': 'package shop\n\nclass CartTest\n',
      'src/functionalTest/kotlin/shop/CartTest.kt': 'package shop\n\nclass CartTest\n',
      'src/test/java/shop/NotesTest.java':
        'package shop;\n\n// the class IT note\nclass NotesTest {}\n',
    };

    expect(
      kept(
        files,
        Object.keys(files).map((file) => finding(file)),
      ),
    ).toEqual([
      'src/desktopTest/kotlin/shop/CartTest.kt NetworkInTest',
      'src/androidUnitTest/kotlin/shop/CartTest.kt NetworkInTest',
      'src/test/java/shop/NotesTest.java NetworkInTest',
    ]);
  });

  it('keeps a finding whose path is outside the project instead of failing', () => {
    expect(
      kept({}, [finding('../elsewhere/CartTest.java'), finding('/abs/CartTest.java')]),
    ).toEqual(['../elsewhere/CartTest.java NetworkInTest', '/abs/CartTest.java NetworkInTest']);
  });

  it('leaves other rules alone, also in integration tests', () => {
    const files = { 'src/test/java/shop/CartIT.java': 'package shop;\n\nclass CartIT {}\n' };

    expect(kept(files, [finding('src/test/java/shop/CartIT.java', 'RealClockInTest')])).toEqual([
      'src/test/java/shop/CartIT.java RealClockInTest',
    ]);
  });
});
