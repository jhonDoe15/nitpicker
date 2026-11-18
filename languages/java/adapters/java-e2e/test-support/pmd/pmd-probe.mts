import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import type { JavaFinding } from '../../../typed/java-values.mts';
import { ingestSarif as ingestSarifUntyped } from '../../../../../../shared/ingest/sarif.mjs';
import { withPmdLevels as withPmdLevelsUntyped } from '../../../reporting/sarif/pmd-levels.mjs';
import { applyRuleMessages as applyRuleMessagesUntyped } from '../../../../messages/rule-messages.mjs';
import { INIT_SCRIPT as INIT_SCRIPT_UNTYPED } from '../../../../builds/java-build.mjs';
import { writeRulesets as writeRulesetsUntyped } from '../../../tool-config/pmd-wrappers.mjs';
import { appendSentence, exceptionRoute } from '../views/java-e2e-views.mts';
import { parseJson, textOf } from '../../../../../../shared/values/readers.mts';

const INIT_SCRIPT: string = INIT_SCRIPT_UNTYPED;
const ingestSarif: (
  log: unknown,
  options: { tool: string; root: string },
) => { findings: JavaFinding[] } = ingestSarifUntyped;
const withPmdLevels: (log: unknown) => unknown = withPmdLevelsUntyped;
const applyRuleMessages: (findings: JavaFinding[], options?: undefined) => JavaFinding[] =
  applyRuleMessagesUntyped;
const writeRulesets: (options: {
  module: { sourceRoots: string[]; testSourceRoots: string[] };
  reportDir: string;
  configs: { pmd: object };
  spring: boolean;
  springRules: undefined;
}) => { mainRuleset: string; testsRuleset: string } = writeRulesetsUntyped;

const ruleset = path.resolve(import.meta.dirname, '../../../../gradle/pmd-ruleset.xml');

function scopedRulesets(root: string): string {
  const { mainRuleset, testsRuleset } = writeRulesets({
    module: {
      sourceRoots: [path.join(root, 'src/main/java')],
      testSourceRoots: [path.join(root, 'src/test/java')],
    },
    reportDir: root,
    configs: { pmd: {} },
    spring: false,
    springRules: undefined,
  });
  return [ruleset, mainRuleset, testsRuleset].join(',');
}

export function preparePmdProbe(name: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-${name}-`));
  const version = /^\s*pmd\s*:\s*'([^']+)'/mu.exec(readFileSync(INIT_SCRIPT, 'utf8'))?.[1] ?? '';
  const sources = path.join(root, 'src');
  writeFileSync(path.join(root, 'settings.gradle'), `rootProject.name = '${name}'\n`);
  writeFileSync(
    path.join(root, 'build.gradle'),
    `plugins { id 'java' }
repositories { mavenCentral() }
configurations { probe }
dependencies {
  probe 'net.sourceforge.pmd:pmd-cli:${version}'
  probe 'net.sourceforge.pmd:pmd-java:${version}'
}
tasks.register('pmdProbe', JavaExec) {
  classpath = configurations.probe
  mainClass = 'net.sourceforge.pmd.cli.PmdCli'
  args 'check', '--no-cache', '--no-progress', '--format', 'sarif',
    '--report-file', 'pmd.sarif', '--dir', ${JSON.stringify(sources)},
    '--rulesets', ${JSON.stringify(scopedRulesets(root))}
  ignoreExitValue = true
}
`,
  );
  return root;
}

export function runPmdProbe(root: string, gradle: string): void {
  const result = spawnSync(gradle, ['--console=plain', '--quiet', 'pmdProbe'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
}

export function readPmdProbeFindings(root: string): JavaFinding[] {
  const report = readFileSync(path.join(root, 'pmd.sarif'), 'utf8');
  return applyRuleMessages(
    ingestSarif(withPmdLevels(parseJson(report)), { tool: 'pmd', root }).findings,
  );
}

export function usePmdProbe(
  name: string,
  gradle: string,
  { fixtures, target }: { fixtures: string; target: string },
): { readonly findings: JavaFinding[] } {
  let root: string | undefined;
  let findings: JavaFinding[] = [];
  beforeAll(() => {
    const probeRoot = preparePmdProbe(name);
    root = probeRoot;
    for (const role of ['main', 'test']) {
      const destination = path.resolve(probeRoot, 'src', role, target);
      if (!destination.startsWith(probeRoot + path.sep)) {
        throw new Error(`The fixture target ${target} leaves the probe project`);
      }
      cpSync(fixtures, destination, { recursive: true });
    }
    runPmdProbe(probeRoot, gradle);
    findings = readPmdProbeFindings(probeRoot);
  });
  afterAll(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return {
    get findings() {
      return findings;
    },
  };
}

export function markedProbeLines(
  fixtures: string,
  marker: RegExp,
  place: (location: string, match: RegExpExecArray) => string,
): string[] {
  return readdirSync(fixtures, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.java'))
    .flatMap((name) =>
      readFileSync(path.join(fixtures, name), 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const match = marker.exec(line);
          const location = `${name.split(path.sep).join('/')}:${String(index + 1)}`;
          return match === null ? [] : [place(location, match)];
        }),
    );
}

export function markedRoleLines(
  fixtures: string,
  marker: RegExp,
  prefixOf: (role: string) => string,
  role: string,
): string[] {
  return markedProbeLines(fixtures, marker, (location) => `${prefixOf(role)}/${location}`).sort();
}

function probeFindingsIn(
  findings: readonly JavaFinding[],
  role: string,
  rules: ReadonlySet<string>,
): JavaFinding[] {
  return findings.filter(
    ({ rule, path: file }) => rules.has(rule) && file.startsWith(`src/${role}/`),
  );
}

export function reportedProbeLines(
  findings: readonly JavaFinding[],
  role: string,
  rules: ReadonlySet<string>,
): string[] {
  return probeFindingsIn(findings, role, rules).map(
    ({ path: file, location }) => `${file}:${String(location?.line)}`,
  );
}

export function reportedRoleLines(
  findings: readonly JavaFinding[],
  role: string,
  rules: ReadonlySet<string>,
): string[] {
  return reportedProbeLines(findings, role, rules).sort();
}

const RULE_MARKER = /\/\/ violation: (\w+)$/u;

export function markedRuleLines(fixtures: string, role: string): string[] {
  return markedProbeLines(
    fixtures,
    RULE_MARKER,
    (location, match) => `src/${role}/java/demo/${location} ${match[1] ?? ''}`,
  ).sort();
}

export function reportedRuleLines(
  findings: readonly JavaFinding[],
  role: string,
  rules: ReadonlySet<string>,
): string[] {
  return probeFindingsIn(findings, role, rules)
    .map(({ rule, path: file, location }) => `${file}:${String(location?.line)} ${rule}`)
    .sort();
}

export function routedMessages(
  findings: readonly JavaFinding[],
  rulesetPath: string,
  ruleName: string,
): { readonly actual: string | undefined; readonly expected: string } {
  const ruleset = readFileSync(rulesetPath, 'utf8');
  const rule = ruleset.slice(ruleset.indexOf(`<rule name="${ruleName}"`));
  const message = textOf(/message="([^"]*)"/u.exec(rule)?.[1]);
  const first = findings.find(({ rule: name }) => name === ruleName);
  return {
    actual: first?.message,
    expected: appendSentence(
      message,
      exceptionRoute({ rule: `pmd/${ruleName}`, path: first?.path }),
    ),
  };
}
