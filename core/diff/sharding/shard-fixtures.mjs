import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporaryDirectories = [];

export function removeFixtures() {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function analyzer(name, { dependencies = [], shardWeight = 1 } = {}) {
  return {
    name,
    version: '1.0.0',
    configurationHash: `hash-${name}`,
    exclusions: ['generated/**'],
    dependencies,
    shardWeight,
  };
}

export function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'quality-shards-'));
  temporaryDirectories.push(root);
  return {
    inputRoot: path.join(root, 'shards'),
    outputRoot: path.join(root, 'combined'),
  };
}

function shardTool(name, findings, { toolVersions, configurationHashes }) {
  return {
    name,
    version: toolVersions[name] ?? '1.0.0',
    configurationHash: configurationHashes[name] ?? `hash-${name}`,
    base: 0,
    head: 0,
    new: findings.filter(({ tool }) => tool === name).length,
    resolved: 0,
    unchanged: 0,
    changedMetrics: 0,
    baseElapsedMs: 3,
    headElapsedMs: 5,
    elapsedMs: 8,
  };
}

function shardSummary(index, options) {
  const { tools, headSha, findings, toolVersions, configurationHashes } = options;
  return {
    requestedBaseRef: 'origin/master',
    resolvedBaseSha: 'base',
    mergeBaseSha: 'merge-base',
    headSha,
    policyHash: `shard-${String(index)}`,
    tools: tools.map((name) => shardTool(name, findings, { toolVersions, configurationHashes })),
    exclusions: ['generated/**'],
    renamedPaths: 0,
    elapsedMs: options.elapsedMs,
    overallStatus: options.overallStatus,
    newEnforceableFindings: findings.length,
  };
}

export function writeShard(
  inputRoot,
  index,
  {
    tools,
    headSha = 'head',
    findings = [],
    held,
    toolErrors = [],
    toolVersions = {},
    configurationHashes = {},
    overallStatus = 'completed',
    elapsedMs = 10,
  },
) {
  const shardRoot = path.join(inputRoot, String(index));
  mkdirSync(shardRoot, { recursive: true });
  writeJson(
    path.join(shardRoot, 'summary.json'),
    shardSummary(index, {
      tools,
      headSha,
      findings,
      toolVersions,
      configurationHashes,
      elapsedMs,
      overallStatus,
    }),
  );
  writeJson(path.join(shardRoot, 'new-findings.json'), findings);
  writeJson(path.join(shardRoot, 'resolved-findings.json'), []);
  writeJson(path.join(shardRoot, 'changed-metrics.json'), []);
  if (held !== undefined) {
    writeJson(path.join(shardRoot, 'held-findings.json'), held);
  }
  writeJson(path.join(shardRoot, 'tool-errors.json'), toolErrors);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(root, name) {
  return JSON.parse(readFileSync(path.join(root, name), 'utf8'));
}

export function captureOutput() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: { write: (value) => (stdoutText += value) },
    stderr: { write: (value) => (stderrText += value) },
    get stdoutText() {
      return stdoutText;
    },
    get stderrText() {
      return stderrText;
    },
  };
}
