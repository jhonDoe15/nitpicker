import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archunitMatcher,
  collectTestResults,
  junitLauncherVersion,
  pitTargets,
  pitTests,
  runJacocoReport,
} from './maven-tests.mjs';

const roots = [];

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-tests-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const suite = (name, cases) =>
  `<?xml version="1.0"?><testsuite name="${name}">${cases
    .map(([test, failure]) =>
      failure === undefined
        ? `<testcase classname="${name}" name="${test}"/>`
        : `<testcase classname="${name}" name="${test}"><failure message="${failure}" type="AssertionError">trace</failure></testcase>`,
    )
    .join('')}</testsuite>`;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('archunitMatcher', () => {
  it('matches the default ArchUnit class names and nested classes, or the configured patterns', () => {
    const matches = archunitMatcher();

    expect(
      ['shop.ArchTest', 'shop.web.ArchitectureTest$Inner', 'shop.OrderTest'].map(matches),
    ).toEqual([true, true, false]);
    expect(archunitMatcher('**/*Rules.class, shop/Layers.class')('shop.Layers')).toBe(true);
  });
});

describe('pitTargets', () => {
  it('targets the first package holding classes on each path, and names classes beside org.pitest', () => {
    const classes = tree({
      'org/example/Main.class': '',
      'org/example/calc/Calc.class': '',
      'shop/web/Controller.class': '',
      'shop/web/api/Dto.class': '',
      'Root.class': '',
    });

    expect(pitTargets(classes)).toEqual(['Root', 'org.example.*', 'shop.web.*']);
    expect(pitTargets(tree({ 'org/Top.class': '', 'org/acme/A.class': '' }))).toEqual([
      'org.Top',
      'org.acme.*',
    ]);
  });
});

describe('pitTests', () => {
  it('lists outer test classes by name, without ArchUnit rule classes', () => {
    const classes = tree({
      'shop/OrderTest.class': '',
      'shop/OrderTest$Nested.class': '',
      'shop/ArchTest.class': '',
    });

    expect(pitTests(classes, archunitMatcher())).toEqual(['shop.OrderTest']);
  });
});

describe('junitLauncherVersion', () => {
  it('asks for the launcher matching the engine only when the classpath lacks one', () => {
    expect(junitLauncherVersion(['/m2/junit-platform-engine-1.11.4.jar', '/m2/x.jar'])).toBe(
      '1.11.4',
    );
    expect(
      junitLauncherVersion([
        '/m2/junit-platform-engine-1.11.4.jar',
        '/m2/junit-platform-launcher-1.11.4.jar',
      ]),
    ).toBeUndefined();
    expect(junitLauncherVersion(['/m2/junit-4.13.2.jar'])).toBeUndefined();
  });
});

describe('collectTestResults', () => {
  const since = Date.now() - 1000;

  it('copies ArchUnit reports and ignores their failures and stale reports', () => {
    const reports = tree({
      'TEST-shop.ArchTest.xml': suite('shop.ArchTest', [['layers', 'Rule violated']]),
      'TEST-shop.OldTest.xml': suite('shop.OldTest', [['old', 'stale']]),
      'TEST-shop.OrderTest.xml': suite('shop.OrderTest', [['totals']]),
    });
    utimesSync(
      path.join(reports, 'TEST-shop.OldTest.xml'),
      new Date(2020, 0, 1),
      new Date(2020, 0, 1),
    );
    const reportDir = tree({});

    collectTestResults({
      module: { basedir: '/m', surefireReports: reports, failsafeReports: reports },
      reportDir,
      since,
      isArchunit: archunitMatcher(),
    });

    expect(existsSync(path.join(reportDir, 'archunit/TEST-shop.ArchTest.xml'))).toBe(true);
    expect(existsSync(path.join(reportDir, 'archunit/TEST-shop.OrderTest.xml'))).toBe(false);
  });

  it('fails with the first failing tests by name', () => {
    const cases = Array.from({ length: 12 }, (_, index) => [
      `case${String(index)}`,
      `expected ${String(index)}`,
    ]);
    const reports = tree({ 'TEST-shop.OrderTest.xml': suite('shop.OrderTest', cases) });

    const listed = cases
      .slice(0, 10)
      .map(([test, failure]) => `  shop.OrderTest.${test}: ${failure}`);

    expect(() => {
      collectTestResults({
        module: { basedir: '/m', surefireReports: reports, failsafeReports: reports },
        reportDir: tree({}),
        since,
        isArchunit: archunitMatcher(),
      });
    }).toThrow(
      new Error(
        [
          'Tests fail in /m; nitpicker needs a passing test suite for coverage and mutation testing:',
          ...listed,
          '  and 2 more',
        ].join('\n'),
      ),
    );
  });

  it('fails on failing Failsafe tests as on Surefire ones, reading a shared directory once', () => {
    const surefire = tree({
      'TEST-shop.OrderTest.xml': suite('shop.OrderTest', [['totals', 'no']]),
    });
    const failsafe = tree({ 'TEST-shop.OrderIT.xml': suite('shop.OrderIT', [['stores', 'gone']]) });
    const run = (failsafeReports) => () => {
      collectTestResults({
        module: { basedir: '/m', surefireReports: surefire, failsafeReports },
        reportDir: tree({}),
        since,
        isArchunit: archunitMatcher(),
      });
    };
    const failing = (...lines) =>
      new Error(
        [
          'Tests fail in /m; nitpicker needs a passing test suite for coverage and mutation testing:',
          ...lines,
        ].join('\n'),
      );

    expect(run(failsafe)).toThrow(
      failing('  shop.OrderTest.totals: no', '  shop.OrderIT.stores: gone'),
    );
    expect(run(`${surefire}/.`)).toThrow(failing('  shop.OrderTest.totals: no'));
  });

  it('reports whether any test ran', () => {
    const run = (files) =>
      collectTestResults({
        module: {
          basedir: '/m',
          surefireReports: tree(files),
          failsafeReports: '/missing',
          testOutputDirectory: tree({}),
        },
        reportDir: tree({}),
        since,
        isArchunit: archunitMatcher(),
      });

    expect([
      run({}),
      run({ 'TEST-shop.OrderTest.xml': suite('shop.OrderTest', [['totals']]) }),
    ]).toEqual([false, true]);
  });

  it('fails when surefire ran none of the ArchUnit classes', () => {
    const testClasses = tree({ 'shop/LayerRules.class': '', 'shop/OrderTest.class': '' });

    expect(() => {
      collectTestResults({
        module: {
          basedir: '/m',
          surefireReports: tree({
            'TEST-shop.OrderTest.xml': suite('shop.OrderTest', [['totals']]),
          }),
          failsafeReports: '/missing',
          testOutputDirectory: testClasses,
        },
        reportDir: tree({}),
        since,
        isArchunit: archunitMatcher('**/*Rules.class'),
      });
    }).toThrow(
      new Error(
        'maven-surefire-plugin ran none of the ArchUnit classes in /m (shop.LayerRules). ' +
          'Let surefire run them (its <includes>, no skipTests) so nitpicker can read their results',
      ),
    );
  });
});

describe('runJacocoReport', () => {
  it('writes an empty report for a module without main classes', () => {
    const reportDir = tree({});
    const module = {
      basedir: '/m',
      coordinates: 'shop:it',
      outputDirectory: path.join(reportDir, 'missing'),
    };

    runJacocoReport({
      module,
      reportDir,
      tools: {},
      execFile: '/m/none.exec',
      since: 0,
      testsRan: true,
    });

    expect(readFileSync(path.join(reportDir, 'jacoco.xml'), 'utf8')).toBe(
      '<?xml version="1.0"?><report name="shop:it"></report>',
    );
  });
});
