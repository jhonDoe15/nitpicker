import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { collectJavaFindings } from '../../../adapters/java-diff.mts';
import { HOSTS_OFF_VARIABLE, TRACE_VARIABLE } from '../config/host-environment.config.mts';
import {
  hostedEvery,
  otherOutcomes,
  reportsUnder,
} from '../session/test-support/report-parity.mts';

const BUILD_TIMEOUT_MS = 300_000;
const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../../adapters/fixtures');
type Modules = readonly (readonly [string, string])[];
const JAVA_MODULES: Modules = [
  ['guards-project', 'guards'],
  ['effects-project', 'effects'],
  ['guards-project', 'guards-again'],
];
const JAVA_TOOLS = [
  'net.sourceforge.pmd.cli.PmdCli',
  'de.thetaphi.forbiddenapis.cli.CliMain',
  'com.google.googlejavaformat.java.Main',
  'CpdReport',
  'StructureMetrics',
  'nitpicker.effects.Effects',
  'javac',
  'jdeps',
];
const KOTLIN_TOOLS = ['io.gitlab.arturbosch.detekt.cli.Main', 'nitpicker.kotlinpsi.KotlinPsi'];
const KOTLIN_MODULES = 2;
const DUPLICATE_REPORTS =
  /(?:^|\/)(?:jscpd(?:-renamed)?\/|(?:renamed-)?(?:kotlin-)?duplicates\.json$)/u;
const base = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-hosts-'));

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

function javaProject(): string {
  const root = path.join(base, 'java');
  mkdirSync(root);
  writeFileSync(
    path.join(root, 'settings.gradle'),
    `rootProject.name = 'hosts'\n${JAVA_MODULES.map(([, name]) => `include '${name}'\n`).join('')}`,
  );
  for (const [sources, name] of JAVA_MODULES) {
    cpSync(path.join(fixtures, sources), path.join(root, name), { recursive: true });
    rmSync(path.join(root, name, 'settings.gradle'), { force: true });
  }
  return root;
}

function kotlinProject(): string {
  const root = path.join(base, 'kotlin');
  cpSync(path.join(fixtures, 'kotlin-multi-project'), root, { recursive: true });
  return root;
}

type Run = { readonly reports: Record<string, string>; readonly findings: unknown };

function analyze(root: string, preset: string, trace: string | undefined): Run {
  const reportDirectory = path.join(root, 'reports');
  vi.stubEnv(HOSTS_OFF_VARIABLE, trace === undefined ? '1' : undefined);
  vi.stubEnv(TRACE_VARIABLE, trace);
  try {
    const findings = collectJavaFindings(root, {
      gradle,
      policy: { quick: true, preset },
      reportDirectory,
    });
    const reports = Object.fromEntries(
      Object.entries(reportsUnder(reportDirectory, root)).filter(
        ([name]) => !DUPLICATE_REPORTS.test(name),
      ),
    );
    return { reports, findings };
  } finally {
    vi.unstubAllEnvs();
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}

function traceLines(preset: string): string[] {
  const trace = tracePath(preset);
  return existsSync(trace) ? readFileSync(trace, 'utf8').split('\n') : [];
}

function tracePath(preset: string): string {
  return path.join(base, `${preset}-trace.log`);
}

const CASES = [
  { preset: 'java', project: javaProject, tools: JAVA_TOOLS, modules: JAVA_MODULES.length },
  { preset: 'kotlin', project: kotlinProject, tools: KOTLIN_TOOLS, modules: KOTLIN_MODULES },
];

describe.skipIf(!enabled).each(CASES)(
  'the shared tool JVMs of a Gradle build with $preset subprojects',
  ({ preset, project, tools, modules }) => {
    let root: string;
    let fresh: Run;
    let hosted: Run;

    beforeAll(() => {
      root = project();
      fresh = analyze(root, preset, undefined);
    }, BUILD_TIMEOUT_MS);

    beforeAll(() => {
      hosted = analyze(root, preset, tracePath(preset));
    }, BUILD_TIMEOUT_MS);

    it('write the reports of fresh JVMs, and host the tools', () => {
      expect(hosted.reports).toEqual(fresh.reports);
      expect(hosted.findings).toEqual(fresh.findings);
      expect(hostedEvery(traceLines(preset), tools, modules)).toEqual(tools.map(() => true));
      expect(otherOutcomes(traceLines(preset))).toEqual([]);
    });
  },
);
