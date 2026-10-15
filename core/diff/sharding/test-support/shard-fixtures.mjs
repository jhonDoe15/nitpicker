import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { useGitFixtures } from '../../git/test-support/git-repository.mjs';

export function useShardFixtures() {
  const { temporaryRoot } = useGitFixtures();

  function createFixture() {
    const root = temporaryRoot('quality-shards-');
    return {
      inputRoot: path.join(root, 'shards'),
      outputRoot: path.join(root, 'combined'),
    };
  }

  return { createFixture };
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
    ...options.carried,
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
    carried = {},
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
      carried,
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
