import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectJavaFindings } from '../../java-diff.mjs';
import { FAN_OUT_LEAD, FAN_OUT_RULE } from '../../../messages/fan-out-details.mjs';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { appendSentence } from '../../../../../shared/messages/exception-sentence.mjs';
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

const PREFETCH = 'src/main/java/shop/Prefetch.java';
const RULESET = path.resolve(import.meta.dirname, '../../../gradle/pmd-main-ruleset.xml');
const FAN_OUT_LEADS = [
  ['urls', 'CompletableFuture.supplyAsync'],
  ['urls', 'ExecutorService.submit'],
  ['urls', 'HttpClient.sendAsync'],
  ['urls', 'ExecutorService.submit'],
  ['urls', 'Executor.execute'],
  ['urls', 'Thread.startVirtualThread'],
  ['urls', 'CompletableFuture.supplyAsync'],
  ['urls'],
  ['urls'],
  ['urls', 'Thread.start'],
  ['urls', 'Thread.Builder.start'],
  ['tasks', 'ExecutorService.invokeAll'],
  ['urls.subList(0,urls.size())', 'CompletableFuture.supplyAsync'],
  ['urls', 'CompletableFuture.supplyAsync'],
  ['IntStream.range(0,count)', 'CompletableFuture.supplyAsync'],
  ['getUrls()', 'CompletableFuture.supplyAsync'],
  ['urls', 'CompletableFuture.supplyAsync'],
  ['getUrls()', 'CompletableFuture.supplyAsync'],
];

function fanOutRest() {
  const ruleset = readFileSync(RULESET, 'utf8');
  const rule = ruleset.slice(ruleset.indexOf(`<rule name="${FAN_OUT_RULE}"`));
  const message = /message="([^"]*)"/u.exec(rule)[1].slice(FAN_OUT_LEAD.length);
  return appendSentence(message, exceptionRoute({ rule: `pmd/${FAN_OUT_RULE}`, path: PREFETCH }));
}

function fanOutLead([collection, starter]) {
  const work =
    starter === undefined ? 'a task that makes a remote or message call' : `\`${starter}\``;
  return `\`${collection}\` starts ${work} for every element at once`;
}

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
      FAN_OUT_LEADS.map((lead) => `${fanOutLead(lead)}${fanOutRest()}`),
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
