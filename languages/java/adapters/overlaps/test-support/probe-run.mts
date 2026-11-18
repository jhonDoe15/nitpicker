import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  fieldOf,
  fieldsOf,
  listOf,
  parseJson,
  textOf,
} from '../../../../../shared/values/readers.mts';
import { collectJavaFindings } from '../../java-diff.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import { overlapPairs } from '../static-overlaps.mts';

type Probe = {
  readonly sources: Record<string, string>;
  readonly findings: readonly unknown[];
};
type ProbeOptions = {
  readonly gradle?: string;
  readonly maven?: string | undefined;
  readonly build?: string;
};
type ProbeEntry = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line?: number;
  readonly symbol?: unknown;
  readonly message?: string;
};

export const PROBE_FILE = path.resolve(import.meta.dirname, '../fixtures/probe-findings.json');
const PROJECT = path.resolve(import.meta.dirname, '../../fixtures/gradle-project');
const POM = path.resolve(import.meta.dirname, '../../../maven/fixtures/single/pom.xml');
const GRADLE_FILES = ['build.gradle', 'settings.gradle'];
const EXTRA_DEPENDENCIES = [
  "    implementation 'org.jspecify:jspecify:1.0.0'",
  "    testImplementation 'junit:junit:4.13.2'",
];
const EXTRA_MAVEN_DEPENDENCIES = [
  '    <dependency><groupId>org.jspecify</groupId><artifactId>jspecify</artifactId>' +
    '<version>1.0.0</version></dependency>',
  '    <dependency><groupId>junit</groupId><artifactId>junit</artifactId>' +
    '<version>4.13.2</version><scope>test</scope></dependency>',
];
const KEPT_TOOLS = new Set(['pmd', 'spotbugs', 'checkstyle', 'errorprone', 'forbiddenapis']);
const MESSAGE_RULES = new Set(
  overlapPairs()
    .filter(({ scope }) => scope === 'variable')
    .flatMap(({ primary, secondary }) => [...primary, ...secondary]),
);

export function readProbe(file = PROBE_FILE): Probe {
  const probe = parseJson(readFileSync(file, 'utf8'));
  return {
    sources: Object.fromEntries(
      Object.entries(fieldsOf(fieldOf(probe, 'sources'))).map(([name, text]) => [
        name,
        textOf(text),
      ]),
    ),
    findings: listOf(fieldOf(probe, 'findings')),
  };
}

export function printProbe(probe: Probe): string {
  return `${JSON.stringify(probe, null, 2)}\n`;
}

function addDependencies(file: string, opening: string, lines: readonly string[]): void {
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(opening, `${opening}${lines.join('\n')}\n`),
  );
}

function writeBuild(root: string, build: string): void {
  if (build === 'maven') {
    for (const name of GRADLE_FILES) {
      rmSync(path.join(root, name));
    }
    cpSync(POM, path.join(root, 'pom.xml'));
    addDependencies(path.join(root, 'pom.xml'), '<dependencies>\n', EXTRA_MAVEN_DEPENDENCIES);
  } else {
    addDependencies(path.join(root, 'build.gradle'), 'dependencies {\n', EXTRA_DEPENDENCIES);
  }
}

function writeProject(root: string, sources: Record<string, string>, build: string): void {
  cpSync(PROJECT, root, { recursive: true });
  rmSync(path.join(root, 'src'), { recursive: true });
  for (const [file, text] of Object.entries(sources)) {
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`Probe source ${file} is outside the probe project.`);
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  writeBuild(root, build);
}

function fixtureEntry({
  tool,
  rule,
  path: file,
  location,
  symbol,
  message,
}: JavaFinding): ProbeEntry {
  return {
    tool,
    rule,
    path: file,
    ...(location?.line === undefined ? {} : { line: location.line }),
    ...(tool === 'spotbugs' && symbol !== undefined ? { symbol } : {}),
    ...(MESSAGE_RULES.has(`${tool}/${rule}`) && message !== undefined ? { message } : {}),
  };
}

function entryKey(entry: ProbeEntry): string {
  return [
    entry.tool,
    entry.path,
    String(entry.line ?? ''),
    entry.rule,
    textOf(entry.symbol ?? ''),
  ].join('\u0000');
}

function probeEntries(findings: readonly JavaFinding[]): ProbeEntry[] {
  return findings
    .filter(({ tool }) => KEPT_TOOLS.has(tool))
    .map(fixtureEntry)
    .sort((left, right) => entryKey(left).localeCompare(entryKey(right), 'en'));
}

export function runProbe(
  sources: Record<string, string>,
  { gradle = 'gradle', maven, build = 'gradle' }: ProbeOptions = {},
): Probe {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-overlap-probe-'));
  try {
    writeProject(root, sources, build);
    const findings = collectJavaFindings(root, {
      gradle,
      maven,
      resolveOverlaps: (reported) => reported,
    });
    return { sources, findings: probeEntries(findings) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function lines(probe: Probe): string[] {
  return probe.findings.map((entry) => JSON.stringify(entry));
}

export function currentDrift(options: ProbeOptions): {
  added: string[];
  removed: string[];
  formatted: boolean;
} {
  const committed = readProbe();
  const fresh = runProbe(committed.sources, options);
  const had = new Set(lines(committed));
  const has = new Set(lines(fresh));
  return {
    added: [...has].filter((line) => !had.has(line)),
    removed: [...had].filter((line) => !has.has(line)),
    formatted: printProbe(fresh) === readFileSync(PROBE_FILE, 'utf8'),
  };
}
