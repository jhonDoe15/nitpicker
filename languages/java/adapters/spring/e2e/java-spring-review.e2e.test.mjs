import { rmSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectJavaFindings } from '../../java-diff.mjs';
import {
  enabled,
  gradle,
  maven,
  roots,
  copyWithout,
  markedReviewViolations,
  reviewFindings,
  located,
  comparable,
  stableConsoleEmitters,
} from '../__tests__/spring-project.mjs';

describe.skipIf(!enabled)('Review rules on Gradle and Maven builds of a Spring project', () => {
  const runs = {};

  beforeAll(() => {
    const gradleProject = copyWithout('pom.xml');
    const mavenProject = copyWithout('build.gradle', 'settings.gradle');
    runs.markers = markedReviewViolations(gradleProject);
    runs.gradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
    runs.maven = collectJavaFindings(mavenProject, { maven, policy: {} });
  }, 300_000);

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds the same findings on both builds', () => {
    expect(comparable(reviewFindings(runs.maven))).toEqual(comparable(reviewFindings(runs.gradle)));
    expect(comparable(stableConsoleEmitters(runs.maven))).toEqual(
      comparable(stableConsoleEmitters(runs.gradle)),
    );
  });

  it('reports exactly the PMD violations marked in the fixture on both builds', () => {
    expect(located(reviewFindings(runs.gradle))).toEqual(runs.markers);
    expect(located(reviewFindings(runs.maven))).toEqual(runs.markers);
  });

  it('names Awaitility for a fixed sleep, as the project has it, and calls join(ms) a timed wait', () => {
    const waits = runs.gradle.filter(({ rule }) => rule === 'FixedSleepInTest');
    const timed = waits.filter(({ message }) => message.startsWith('A timed wait, '));

    expect(waits[0].message).toMatch(/with Awaitility, which the project's tests use/u);
    expect(timed.map(({ path: file, location }) => `${file}:${String(location?.line)}`)).toEqual([
      'src/test/java/shop/WaitingTest.java:87',
    ]);
    expect(timed[0].message).toMatch(/until\(\(\) -> !thread\.isAlive\(\)\)/u);
  });

  it('names the call, the class that loads it and the member that runs it in a class-load effect', () => {
    const effects = runs.maven.filter(({ rule }) => rule === 'ClassLoadEffect');
    const warehouseEffects = effects.filter(({ path: file }) =>
      /\/Warehouse\w*\.java$/u.test(file),
    );

    expect(
      warehouseEffects.map(({ message, identity }) => [
        /^.*?: `[^`]+` runs while (\w+ loads \([^)]*\))/u.exec(message)?.[1],
        identity,
      ]),
    ).toEqual([
      [
        'Warehouse loads (in static field WORKERS)',
        'fp:nitpicker/subject=Warehouse.WORKERS: Executors.newFixedThreadPool(...)',
      ],
      [
        'Warehouse loads (in a static block)',
        'fp:nitpicker/subject=Warehouse.static {}: Files.exists(...)',
      ],
      [
        'Warehouse loads (in method connect, which static field STOCK calls)',
        'fp:nitpicker/subject=Warehouse.connect(): DriverManager.getConnection(...)',
      ],
      [
        'Ledger loads (in constructor Ledger of an instance created at load)',
        'fp:nitpicker/subject=Ledger.Ledger(): DriverManager.getConnection(...)',
      ],
      [
        'WarehouseConfig loads (in a static block)',
        'fp:nitpicker/subject=WarehouseConfig.static {}: Files.exists(...)',
      ],
    ]);
    const warehouse = effects.find(({ path: file }) => file.endsWith('Warehouse.java'))?.message;

    expect(warehouse?.slice(warehouse.indexOf('If this is intended'))).toBe(
      [
        'If this is intended, add {"rule":"pmd/ClassLoadEffect","paths":["src/main/java/shop/Warehouse.java"],',
        '"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ].join(''),
    );
  });

  it('names both nestings of a lock-order inversion and the locked write of a field, keyed without lines', () => {
    const named = (rule) =>
      runs.maven
        .filter((finding) => finding.rule === rule)
        .map(({ message, identity }) => [message.slice(0, message.indexOf(': ')), identity]);

    expect(named('LockOrderInversion').slice(0, 2)).toEqual([
      [
        'transfer() takes `audit` while it holds `accounts`, and report() takes `accounts` while it holds `audit`',
        'fp:nitpicker/subject=Transfers.transfer(): accounts -> audit',
      ],
      [
        'report() takes `accounts` while it holds `audit`, and transfer() takes `audit` while it holds `accounts`',
        'fp:nitpicker/subject=Transfers.report(): audit -> accounts',
      ],
    ]);
    expect(named('InconsistentFieldLocking')).toEqual([
      [
        'bump() writes `count` without a lock, while increment() writes it holding `lock`',
        'fp:nitpicker/subject=Counters.bump(): count',
      ],
      [
        'reset() writes `count` without a lock, while increment() writes it holding `lock`',
        'fp:nitpicker/subject=Counters.reset(): count',
      ],
      [
        'reset() writes `hits` without a lock, while increment() writes it holding `lock`',
        'fp:nitpicker/subject=Counters.reset(): hits',
      ],
      [
        'clear() writes `total` without a lock, while add() writes it holding `guard`',
        'fp:nitpicker/subject=Counters.clear(): total',
      ],
      [
        'rename() writes `label` without a lock, while name() writes it holding `this`',
        'fp:nitpicker/subject=Counters.rename(): label',
      ],
    ]);
    const inversion = runs.gradle.find(({ rule }) => rule === 'LockOrderInversion')?.message;

    expect(inversion?.slice(inversion.indexOf('If this is intended'))).toBe(
      [
        'If this is intended, add {"rule":"pmd/LockOrderInversion","paths":["src/main/java/shop/locking/Transfers.java"],',
        '"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ].join(''),
    );
  });

  it('reports the main classes only tests use and spares the Spring service', () => {
    const testOnly = (findings) =>
      findings
        .filter(({ rule }) => rule === 'test-only-export')
        .map(({ path: file, location }) => `${file}:${String(location?.line)}`);

    expect(testOnly(runs.gradle)).toEqual([
      'src/main/java/shop/Filter.java:5',
      'src/main/java/shop/SampleOrders.java:5',
    ]);
    expect(testOnly(runs.maven)).toEqual(testOnly(runs.gradle));
  });
});
