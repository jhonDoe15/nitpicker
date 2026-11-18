import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT as INIT_SCRIPT_UNTYPED } from '../../../builds/java-build.mjs';
import { benchmarkRun } from '../test-support/perf/benchmark-run.mts';
import {
  largestShares,
  parseRuleTimes,
  xpathRuleNames,
} from '../test-support/perf/pmd-benchmark.mts';
import { syntheticSpringClass } from '../test-support/perf/synthetic-spring-class.mts';

const INIT_SCRIPT: string = INIT_SCRIPT_UNTYPED;
const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const GRADLE_DIRECTORY = path.resolve(import.meta.dirname, '../../../gradle');
const RULESETS = ['spring-ruleset.xml', 'pmd-ruleset.xml', 'pmd-main-ruleset.xml'].map((name) =>
  path.join(GRADLE_DIRECTORY, name),
);
const METHODS = 80;
const MAX_SHARE = 0.35;
const WATCHED = [
  'SpringNoPostConstructIo',
  'SpringBeanCollectionState',
  'MixedTimeUnits',
  'InconsistentFieldLocking',
];
const SPRING = '6.1.6';
const AUXILIARY = [
  `org.springframework:spring-context:${SPRING}`,
  `org.springframework:spring-web:${SPRING}`,
  `org.springframework:spring-jdbc:${SPRING}`,
  'org.springframework.data:spring-data-commons:3.2.5',
  'jakarta.annotation:jakarta.annotation-api:2.1.1',
  'jakarta.persistence:jakarta.persistence-api:3.1.0',
];

function buildScript(version: string, sources: string): string {
  return `plugins { id 'java' }
repositories { mavenCentral() }
configurations { probe; auxiliary }
dependencies {
  probe 'net.sourceforge.pmd:pmd-cli:${version}'
  probe 'net.sourceforge.pmd:pmd-java:${version}'
${AUXILIARY.map((coordinates) => `  auxiliary '${coordinates}'`).join('\n')}
}
tasks.register('pmdBenchmark', JavaExec) {
  classpath = configurations.probe
  mainClass = 'net.sourceforge.pmd.cli.PmdCli'
  ignoreExitValue = true
  doFirst {
    args 'check', '--no-cache', '--no-progress', '--benchmark', '--format', 'text',
      '--dir', ${JSON.stringify(sources)},
      '--rulesets', ${JSON.stringify(RULESETS.join(','))},
      '--aux-classpath', configurations.auxiliary.asPath
  }
}
`;
}

describe.skipIf(!enabled)('Time of the rules nitpicker ships as XPath', () => {
  const run = benchmarkRun(gradle, 'pmdBenchmark', {
    settings: "rootProject.name = 'rule-time'\n",
    prepare: (root) => {
      const sources = path.join(root, 'src', 'shop', 'perf');
      mkdirSync(sources, { recursive: true });
      writeFileSync(path.join(sources, 'Wide.java'), syntheticSpringClass(METHODS));
      const version =
        /^\s*pmd\s*:\s*'([^']+)'/mu.exec(readFileSync(INIT_SCRIPT, 'utf8'))?.[1] ?? '';
      return buildScript(version, path.join(root, 'src'));
    },
  });

  beforeAll(() => {
    run.execute();
  }, 300_000);

  afterAll(() => {
    run.cleanup();
  });

  it('keeps every XPath rule under its share of the rule time on a class with many methods', () => {
    const times = parseRuleTimes(run.output());
    const own = xpathRuleNames(RULESETS);
    const shares = largestShares(times, own);

    expect(times.total).toBeGreaterThan(0);
    expect(
      shares
        .map(({ rule }) => rule)
        .filter((rule) => WATCHED.includes(rule))
        .toSorted(),
    ).toEqual(WATCHED.toSorted());
    expect(shares.filter(({ share }) => share > MAX_SHARE)).toEqual([]);
  });
});
