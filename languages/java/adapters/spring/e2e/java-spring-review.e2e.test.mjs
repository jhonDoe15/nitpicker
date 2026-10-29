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

const FAN_OUT_REST = [
  ', with no bound on how many run together, so a large collection exhausts connections, rate limits or the',
  ' remote service. Bound it: run the tasks on a fixed pool (Executors.newFixedThreadPool(8) passed to',
  ' supplyAsync, or its submit), take a Semaphore permit around each call, or work through fixed-size batches',
  ' (Lists.partition(items, 20)), or send one batch request when the API has one. The default pool of',
  ' CompletableFuture, newCachedThreadPool and newVirtualThreadPerTaskExecutor start a task for every',
  ' element, and a limit constant that no pool or semaphore uses bounds nothing. An exception fits only when',
  ' the collection is always small.',
  ' If this is intended, add {"rule":"pmd/UnboundedFanOut","paths":["src/main/java/shop/Prefetch.java"],',
  '"reason":"..."} to "exceptions" in nitpicker.config.json.',
].join('');

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

  it('names the collection and the task start of an unbounded fan-out', () => {
    const fanOut = runs.gradle.filter(({ rule }) => rule === 'UnboundedFanOut');

    expect(fanOut.map(({ message }) => message)).toEqual(
      ['CompletableFuture.supplyAsync', 'ExecutorService.submit', 'HttpClient.sendAsync'].map(
        (starter) => `\`urls\` starts \`${starter}\` for every element at once${FAN_OUT_REST}`,
      ),
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
