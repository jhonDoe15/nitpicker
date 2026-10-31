import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectJavaFindings } from '../../java-diff.mjs';

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
const KEPT_TOOLS = new Set(['pmd', 'spotbugs', 'checkstyle', 'errorprone']);

export function readProbe(file = PROBE_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function printProbe(probe) {
  return `${JSON.stringify(probe, null, 2)}\n`;
}

function addDependencies(file, opening, lines) {
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(opening, `${opening}${lines.join('\n')}\n`),
  );
}

function writeBuild(root, build) {
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

function writeProject(root, sources, build) {
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

function fixtureEntry({ tool, rule, path: file, location, symbol }) {
  return {
    tool,
    rule,
    path: file,
    ...(location?.line === undefined ? {} : { line: location.line }),
    ...(tool === 'spotbugs' && symbol !== undefined ? { symbol } : {}),
  };
}

function entryKey(entry) {
  return [entry.tool, entry.path, String(entry.line ?? ''), entry.rule, entry.symbol ?? ''].join(
    '\u0000',
  );
}

function probeEntries(findings) {
  return findings
    .filter(({ tool }) => KEPT_TOOLS.has(tool))
    .map(fixtureEntry)
    .sort((left, right) => entryKey(left).localeCompare(entryKey(right), 'en'));
}

export function runProbe(sources, { gradle = 'gradle', maven, build = 'gradle' } = {}) {
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

function lines(probe) {
  return probe.findings.map((entry) => JSON.stringify(entry));
}

export function currentDrift(options) {
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
