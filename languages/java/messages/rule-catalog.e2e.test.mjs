import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../builds/java-build.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../adapters/test-support/gradle-e2e.mjs';
import { readCatalog } from './rule-messages.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const roots = [];

const RULE_FILES = [
  'category/java/errorprone.xml',
  'category/java/bestpractices.xml',
  'google_checks.xml',
  'findbugs.xml',
];
const EXTRA_PMD_RULES = ['AvoidCatchingGenericException'];
const CHECKSTYLE_INFRASTRUCTURE = /^(?:Checker|TreeWalker)$|Filter$|^Suppress/u;

function pinnedVersion(tool) {
  const script = readFileSync(INIT_SCRIPT, 'utf8');
  return new RegExp(`^\\s*${tool}\\s*:\\s*'([^']+)'`, 'mu').exec(script)[1];
}

function extractRuleFiles() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-rule-catalog-'));
  roots.push(root);
  writeFileSync(path.join(root, 'settings.gradle'), "rootProject.name = 'catalog'\n");
  writeFileSync(
    path.join(root, 'build.gradle'),
    `repositories { mavenCentral() }
configurations { probe { transitive = false } }
dependencies {
    probe 'net.sourceforge.pmd:pmd-java:${pinnedVersion('pmd')}'
    probe 'com.puppycrawl.tools:checkstyle:${pinnedVersion('checkstyle')}'
    probe 'com.github.spotbugs:spotbugs:${pinnedVersion('spotbugs')}'
}
tasks.register('ruleFiles', Copy) {
    from({ configurations.probe.collect { zipTree(it) } }) {
        include ${RULE_FILES.map((file) => `'${file}'`).join(', ')}
    }
    into 'rules'
}
`,
  );
  const result = spawnSync(gradle, ['--console=plain', '--quiet', 'ruleFiles'], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(result.stderr).not.toMatch(/FAILURE/u);
  return (file) => readFileSync(path.join(root, 'rules', file), 'utf8');
}

function pmdRules(xml) {
  return [...xml.matchAll(/<rule\s+name="(\w+)"/gu)].map((match) => match[1]);
}

function checkstyleRules(xml) {
  const ids = [];
  for (const match of xml.matchAll(/<module name="(\w+)"\s*(\/?)>/gu)) {
    if (CHECKSTYLE_INFRASTRUCTURE.test(match[1])) {
      continue;
    }
    const body = match[2] === '/' ? '' : xml.slice(match.index + match[0].length);
    const own = body.split(/<module|<\/module>/u)[0];
    ids.push(/<property name="id" value="(\w+)"/u.exec(own)?.[1] ?? match[1]);
  }
  return ids;
}

function spotbugsRules(xml) {
  return [...xml.matchAll(/<BugPattern\s[^>]*?type="(\w+)"/gu)].map((match) => match[1]);
}

const sorted = (ids) => [...new Set(ids)].sort();
const catalogRules = (tool) => Object.keys(readCatalog(tool)).sort();

afterAll(() => {
  if (roots.length > 0) {
    spawnSync(gradle, ['--stop'], { cwd: roots[0], encoding: 'utf8' });
  }
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('Java rule catalogs', () => {
  it(
    'name exactly the rules of the pinned PMD categories, google_checks.xml and SpotBugs',
    () => {
      const read = extractRuleFiles();

      expect({
        pmd: catalogRules('pmd'),
        checkstyle: catalogRules('checkstyle'),
        spotbugs: catalogRules('spotbugs'),
      }).toEqual({
        pmd: sorted([
          ...pmdRules(read('category/java/errorprone.xml')),
          ...pmdRules(read('category/java/bestpractices.xml')),
          ...EXTRA_PMD_RULES,
        ]),
        checkstyle: sorted(checkstyleRules(read('google_checks.xml'))),
        spotbugs: sorted(spotbugsRules(read('findbugs.xml'))),
      });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
