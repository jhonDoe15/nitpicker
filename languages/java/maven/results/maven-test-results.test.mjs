import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archunitMatcher } from '../maven-tests.mjs';
import { copyTestResults, requireTestngRun } from './maven-test-results.mjs';

const roots = [];
const since = Date.now() - 2000;
const LONG_AGO = new Date(2020, 0, 1);

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-results-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function stale(directory, name) {
  utimesSync(path.join(directory, name), LONG_AGO, LONG_AGO);
}

function copied(reportDir, task) {
  const directory = path.join(reportDir, 'test-results', task);
  return readdirSync(directory).sort();
}

function copy(module, reportDir) {
  copyTestResults({ module, reportDir, since, isArchunit: archunitMatcher() });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('copyTestResults', () => {
  it('copies fresh surefire and failsafe reports to their own task folders', () => {
    const surefire = tree({ 'TEST-shop.OrderTest.xml': '<a/>', 'other.txt': 'x' });
    const failsafe = tree({ 'TEST-shop.OrderIT.xml': '<b/>' });
    const reportDir = tree({});

    copy({ surefireReports: surefire, failsafeReports: failsafe }, reportDir);

    expect(copied(reportDir, 'surefire')).toEqual(['TEST-shop.OrderTest.xml']);
    expect(copied(reportDir, 'failsafe')).toEqual(['TEST-shop.OrderIT.xml']);
  });

  it('skips reports left over from an earlier run', () => {
    const surefire = tree({ 'TEST-shop.OldTest.xml': '<a/>', 'TEST-shop.NewTest.xml': '<a/>' });
    const failsafe = tree({ 'TEST-shop.OldIT.xml': '<b/>' });
    stale(surefire, 'TEST-shop.OldTest.xml');
    stale(failsafe, 'TEST-shop.OldIT.xml');
    const reportDir = tree({});

    copy({ surefireReports: surefire, failsafeReports: failsafe }, reportDir);

    expect(copied(reportDir, 'surefire')).toEqual(['TEST-shop.NewTest.xml']);
    expect(readdirSync(path.join(reportDir, 'test-results'))).toEqual(['surefire']);
  });

  it('leaves out the ArchUnit rule classes, as Gradle does for its ArchUnit task', () => {
    const surefire = tree({
      'TEST-shop.ArchTest.xml': '<a/>',
      'TEST-shop.OrderTest.xml': '<a/>',
    });
    const reportDir = tree({});

    copy({ surefireReports: surefire, failsafeReports: path.join(reportDir, 'none') }, reportDir);

    expect(copied(reportDir, 'surefire')).toEqual(['TEST-shop.OrderTest.xml']);
  });

  it('leaves out the ArchUnit rule classes of Failsafe too', () => {
    const failsafe = tree({ 'TEST-shop.ArchTest.xml': '<a/>', 'TEST-shop.OrderIT.xml': '<b/>' });
    const reportDir = tree({});

    copy({ surefireReports: path.join(reportDir, 'none'), failsafeReports: failsafe }, reportDir);

    expect(copied(reportDir, 'failsafe')).toEqual(['TEST-shop.OrderIT.xml']);
  });

  it('copies a directory that surefire and failsafe share only as surefire', () => {
    const shared = tree({ 'TEST-shop.OrderTest.xml': '<a/>' });
    const reportDir = tree({});

    copy(
      { surefireReports: shared, failsafeReports: `${shared}/../${path.basename(shared)}` },
      reportDir,
    );

    expect(readdirSync(path.join(reportDir, 'test-results'))).toEqual(['surefire']);
    expect(copied(reportDir, 'surefire')).toEqual(['TEST-shop.OrderTest.xml']);
  });

  it('copies the output files of redirected test output, except stale and ArchUnit ones', () => {
    const surefire = tree({
      'TEST-shop.OrderTest.xml': '<a/>',
      'shop.OrderTest-output.txt': 'WARN late',
      'shop.OldTest-output.txt': 'old',
      'shop.ArchTest-output.txt': 'rules',
    });
    stale(surefire, 'shop.OldTest-output.txt');
    const reportDir = tree({});

    copy({ surefireReports: surefire, failsafeReports: path.join(reportDir, 'none') }, reportDir);

    expect(copied(reportDir, 'surefire')).toEqual([
      'TEST-shop.OrderTest.xml',
      'shop.OrderTest-output.txt',
    ]);
  });

  it('writes nothing when no report directory exists', () => {
    const reportDir = tree({});

    copy({ surefireReports: '/missing/a', failsafeReports: '/missing/b' }, reportDir);

    expect(readdirSync(reportDir)).toEqual([]);
  });
});

describe('requireTestngRun', () => {
  const PLATFORM_TESTNG = ['/m2/testng-7.10.2.jar', '/m2/junit-platform-engine-1.11.4.jar'];

  function moduleWith(reports) {
    const basedir = tree({
      'target/test-classes/shop/OrderTest.class': '',
      'target/test-classes/shop/LayerArchTest.class': '',
      ...Object.fromEntries(reports.map((name) => [`target/surefire-reports/${name}`, '<a/>'])),
    });
    return {
      basedir,
      testOutputDirectory: path.join(basedir, 'target/test-classes'),
      surefireReports: path.join(basedir, 'target/surefire-reports'),
      failsafeReports: path.join(basedir, 'target/surefire-reports'),
    };
  }

  const check = (module, testRuntime) => () => {
    requireTestngRun({ module, since, isArchunit: archunitMatcher(), testRuntime });
    return 'passed';
  };

  it('fails when the JUnit Platform ran only the ArchUnit classes of a TestNG module', () => {
    const module = moduleWith(['TEST-shop.LayerArchTest.xml']);

    expect(check(module, PLATFORM_TESTNG)).toThrow(
      new Error(
        `Surefire ran none of the tests in ${module.basedir} but the ArchUnit classes: the JUnit Platform on its ` +
          'test classpath makes Surefire use its JUnit Platform provider, which runs TestNG tests only through ' +
          'the TestNG engine. Add org.junit.support:testng-engine to the test dependencies, or run TestNG in ' +
          'a Surefire execution of its own',
      ),
    );
  });

  it('passes when TestNG ran, the TestNG engine is there, or no Platform hides TestNG', () => {
    const archunitOnly = moduleWith(['TEST-shop.LayerArchTest.xml']);

    expect(
      [
        check(
          moduleWith(['TEST-shop.LayerArchTest.xml', 'TEST-shop.OrderTest.xml']),
          PLATFORM_TESTNG,
        ),
        check(archunitOnly, [...PLATFORM_TESTNG, '/m2/testng-engine-1.0.5.jar']),
        check(archunitOnly, ['/m2/testng-7.10.2.jar']),
        check(archunitOnly, ['/m2/junit-platform-engine-1.11.4.jar']),
      ].map((run) => run()),
    ).toEqual(['passed', 'passed', 'passed', 'passed']);
  });
});
