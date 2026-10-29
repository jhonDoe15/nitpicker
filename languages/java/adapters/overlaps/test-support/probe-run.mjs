import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectJavaFindings } from '../../java-diff.mjs';

export const PROBE_FILE = path.resolve(import.meta.dirname, '../fixtures/probe-findings.json');
const PROJECT = path.resolve(import.meta.dirname, '../../fixtures/gradle-project');
const EXTRA_DEPENDENCIES = [
  "    implementation 'org.jspecify:jspecify:1.0.0'",
  "    testImplementation 'junit:junit:4.13.2'",
];
const KEPT_TOOLS = new Set(['pmd', 'spotbugs', 'checkstyle', 'errorprone']);

export function readProbe(file = PROBE_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function printProbe(probe) {
  return `${JSON.stringify(probe, null, 2)}\n`;
}

function writeProject(root, sources) {
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
  const build = path.join(root, 'build.gradle');
  writeFileSync(
    build,
    readFileSync(build, 'utf8').replace(
      'dependencies {\n',
      `dependencies {\n${EXTRA_DEPENDENCIES.join('\n')}\n`,
    ),
  );
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

export function runProbe(sources, { gradle = 'gradle' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-overlap-probe-'));
  try {
    writeProject(root, sources);
    const findings = collectJavaFindings(root, {
      gradle,
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
