import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../builds/java-build.mts';
import { readCatalog } from './rule-messages.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const roots: string[] = [];

const RULE_FILES = [
  'category/java/errorprone.xml',
  'category/java/bestpractices.xml',
  'category/java/performance.xml',
  'category/java/multithreading.xml',
  'category/java/security.xml',
  'google_checks.xml',
  'findbugs.xml',
];
const EXTRA_PMD_RULES = [
  'AvoidCatchingGenericException',
  'SwallowedInterrupt',
  'SimplifyBooleanReturns',
  'SimplifyBooleanExpressions',
  'SimplifiedTernary',
  'SimplifyConditional',
  'CollapsibleIfStatements',
  'LogicInversion',
  'ConfusingTernary',
];
const EXTRA_CHECKSTYLE_RULES = [
  'ConstantName',
  'MagicNumber',
  'UnusedImports',
  'VisibilityModifier',
];
const CHECKSTYLE_INFRASTRUCTURE = /^(?:Checker|TreeWalker)$|Filter$|^Suppress/u;

function pinnedVersion(tool: string): string {
  const script = readFileSync(INIT_SCRIPT, 'utf8');
  return new RegExp(`^\\s*${tool}\\s*:\\s*'([^']+)'`, 'mu').exec(script)?.[1] ?? '';
}

function extractRuleFiles(): (file: string) => string {
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
    timeout: 300_000,
  });
  expect(result.stderr).not.toMatch(/FAILURE/u);
  return (file: string) => readFileSync(path.join(root, 'rules', file), 'utf8');
}

function pmdRules(xml: string): string[] {
  return [...xml.matchAll(/<rule\s+name="(\w+)"/gu)].map((match) => match[1] ?? '');
}

function checkstyleRules(xml: string): string[] {
  const ids: string[] = [];
  for (const match of xml.matchAll(/<module name="(\w+)"\s*(\/?)>/gu)) {
    const name = match[1] ?? '';
    if (CHECKSTYLE_INFRASTRUCTURE.test(name)) {
      continue;
    }
    const body = match[2] === '/' ? '' : xml.slice(match.index + match[0].length);
    const own = body.split(/<module|<\/module>/u)[0] ?? '';
    ids.push(/<property name="id" value="(\w+)"/u.exec(own)?.[1] ?? name);
  }
  return ids;
}

function spotbugsRules(xml: string): string[] {
  return [...xml.matchAll(/<BugPattern\s[^>]*?type="(\w+)"/gu)].map((match) => match[1] ?? '');
}

function sorted(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function catalogRules(tool: string): string[] {
  return Object.keys(readCatalog(tool)).sort();
}

afterAll(() => {
  if (roots.length > 0) {
    spawnSync(gradle, ['--stop'], {
      cwd: roots[0] ?? '.',
      encoding: 'utf8',
      timeout: 60_000,
    });
  }
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('Java rule catalogs', () => {
  it('name exactly the rules of the pinned PMD categories, google_checks.xml and SpotBugs', () => {
    const read = extractRuleFiles();

    expect({
      pmd: catalogRules('pmd'),
      checkstyle: catalogRules('checkstyle'),
      spotbugs: catalogRules('spotbugs'),
    }).toEqual({
      pmd: sorted([
        ...pmdRules(read('category/java/errorprone.xml')),
        ...pmdRules(read('category/java/bestpractices.xml')),
        ...pmdRules(read('category/java/performance.xml')),
        ...pmdRules(read('category/java/multithreading.xml')),
        ...pmdRules(read('category/java/security.xml')),
        ...EXTRA_PMD_RULES,
      ]),
      checkstyle: sorted([
        ...checkstyleRules(read('google_checks.xml')),
        ...EXTRA_CHECKSTYLE_RULES,
      ]),
      spotbugs: sorted(spotbugsRules(read('findbugs.xml'))),
    });
  }, 180_000);
});
