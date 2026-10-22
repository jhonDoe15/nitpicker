import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readUnrunTestFindings } from './unrun-tests.mjs';

const roots = [];
const JAVA_IT = 'package shop;\n\nclass OrderIT {\n  @Test\n  void runs() {}\n}\n';
const MAVEN_MESSAGE =
  'Bind the integration-test and verify goals of maven-failsafe-plugin in this module so OrderIT runs: Surefire skips classes named IT*, *IT and *ITCase, and Failsafe does not run here, so its tests never run.';

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-unrun-tests-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function read(files, manifest) {
  const projectRoot = projectWith(files);
  return readUnrunTestFindings({
    projectRoot,
    reportRoot: path.join(projectRoot, 'target/nitpicker'),
    manifest,
  });
}

function maven(runsFailsafe, testSourceRoots = ['src/test/java']) {
  return { build: 'maven', runsFailsafe, testSourceRoots };
}

describe('readUnrunTestFindings on Maven', () => {
  it('reports a test class Failsafe would run when Failsafe does not run in the module', () => {
    expect(read({ 'src/test/java/shop/OrderIT.java': JAVA_IT }, maven(false))).toEqual([
      {
        tool: 'test-runtime',
        rule: 'test-not-run',
        path: 'src/test/java/shop/OrderIT.java',
        identity: 'OrderIT',
        symbol: 'OrderIT',
        classification: 'enforceable',
        message: `${MAVEN_MESSAGE} If this is intended, add {"rule":"test-runtime/test-not-run","paths":["src/test/java/shop/OrderIT.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
      },
    ]);
  });

  it('covers every Failsafe default name and Kotlin tests under src/test/kotlin', () => {
    const found = read(
      {
        'src/test/java/shop/ITOrders.java': JAVA_IT.replace('OrderIT', 'ITOrders'),
        'src/test/java/shop/OrderITCase.java': JAVA_IT.replace('OrderIT', 'OrderITCase'),
        'src/test/kotlin/shop/PaymentIT.kt':
          'package shop\n\nclass PaymentIT {\n  @Test\n  fun pays() {}\n}\n',
        'src/test/kotlin/shop/RefundIT.kt': 'package shop\n\nclass RefundIT : FunSpec({})\n',
      },
      maven(false),
    );

    expect(found.map((finding) => finding.path)).toEqual([
      'src/test/java/shop/ITOrders.java',
      'src/test/java/shop/OrderITCase.java',
      'src/test/kotlin/shop/PaymentIT.kt',
      'src/test/kotlin/shop/RefundIT.kt',
    ]);
  });

  it('accepts a module where Failsafe runs, and one whose manifest predates the field', () => {
    const files = { 'src/test/java/shop/OrderIT.java': JAVA_IT };

    expect([...read(files, maven(true)), ...read(files, { build: 'maven' })]).toEqual([]);
  });

  it('accepts unit tests, abstract bases, helpers and classes Surefire was set up to run', () => {
    const found = read(
      {
        'src/test/java/shop/OrderTest.java': JAVA_IT.replace('OrderIT', 'OrderTest'),
        'src/test/java/shop/AbstractIT.java':
          'package shop;\n\npublic abstract class AbstractIT {\n  @Test\n  void boots() {}\n}\n',
        'src/test/java/shop/FixturesIT.java': 'package shop;\n\nfinal class FixturesIT {}\n',
        'src/test/java/shop/CheckoutIT.java': JAVA_IT.replace('OrderIT', 'CheckoutIT'),
        'target/nitpicker/test-results/surefire/TEST-shop.CheckoutIT.xml': '<testsuite/>',
      },
      maven(false),
    );

    expect(found).toEqual([]);
  });
});

describe('readUnrunTestFindings in a Maven submodule', () => {
  it('names the project-relative path in the exception', () => {
    const projectRoot = projectWith({ 'src/test/java/shop/OrderIT.java': JAVA_IT });
    const [found] = readUnrunTestFindings({
      projectRoot,
      reportRoot: path.join(projectRoot, 'target/nitpicker'),
      manifest: maven(false),
      modulePath: 'checks',
    });

    expect([found.path, found.message.split('"paths":')[1]]).toEqual([
      'src/test/java/shop/OrderIT.java',
      '["checks/src/test/java/shop/OrderIT.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });
});

describe('readUnrunTestFindings on Gradle', () => {
  it('reports the tests of a test source set that no test task runs', () => {
    const found = read(
      {
        'src/integrationTest/java/shop/OrderSliceTest.java': JAVA_IT.replace(
          'OrderIT',
          'OrderSliceTest',
        ),
        'src/integrationTest/kotlin/shop/PaymentSpec.kt':
          'package shop\n\nclass PaymentSpec : StringSpec({})\n',
        'src/testFixtures/java/shop/Orders.java': 'package shop;\n\npublic final class Orders {}\n',
      },
      {
        unrunTestSourceSets: [
          {
            name: 'integrationTest',
            roots: ['src/integrationTest/java', 'src/integrationTest/kotlin'],
          },
          { name: 'testFixtures', roots: ['src/testFixtures/java'] },
        ],
      },
    );

    expect(found.map(({ path: file, message }) => [file, message.split(':')[0]])).toEqual([
      [
        'src/integrationTest/java/shop/OrderSliceTest.java',
        'Register a Test task for the integrationTest source set (testClassesDirs = sourceSets.integrationTest.output.classesDirs, classpath = sourceSets.integrationTest.runtimeClasspath) so OrderSliceTest runs',
      ],
      [
        'src/integrationTest/kotlin/shop/PaymentSpec.kt',
        'Register a Test task for the integrationTest source set (testClassesDirs = sourceSets.integrationTest.output.classesDirs, classpath = sourceSets.integrationTest.runtimeClasspath) so PaymentSpec runs',
      ],
    ]);
  });

  it('reads no source root outside the project', () => {
    expect(
      read(
        { 'src/test/java/shop/OrderIT.java': JAVA_IT },
        { unrunTestSourceSets: [{ name: 'integrationTest', roots: ['..', '../outside'] }] },
      ),
    ).toEqual([]);
  });

  it('accepts *IT classes in run source sets, which Gradle runs whatever their name', () => {
    expect(
      read({ 'src/test/java/shop/OrderIT.java': JAVA_IT }, { testSourceRoots: ['src/test/java'] }),
    ).toEqual([]);
    expect(
      read({ 'src/test/java/shop/OrderIT.java': JAVA_IT }, { unrunTestSourceSets: [] }),
    ).toEqual([]);
  });
});
