import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

type ShardOptions = {
  readonly tools: readonly string[];
  readonly headSha?: string;
  readonly findings?: readonly object[];
  readonly held?: unknown;
  readonly notes?: unknown;
  readonly toolErrors?: readonly unknown[];
  readonly toolVersions?: Readonly<Record<string, string>>;
  readonly configurationHashes?: Readonly<Record<string, string>>;
  readonly overallStatus?: string;
  readonly elapsedMs?: number;
  readonly carried?: object;
};

export type AnalyzerFixture = {
  readonly name: string;
  version: string;
  readonly configurationHash: string;
  readonly exclusions: readonly string[];
  readonly dependencies: readonly string[];
  readonly shardWeight: number;
  resolveVersion?: () => string;
  resolveConfigurationHash?: (root: string) => string;
};

type SummaryOptions = Required<
  Pick<
    ShardOptions,
    | 'tools'
    | 'headSha'
    | 'findings'
    | 'toolVersions'
    | 'configurationHashes'
    | 'overallStatus'
    | 'elapsedMs'
    | 'carried'
  >
>;

export function useShardFixtures(): {
  readonly createFixture: () => { readonly inputRoot: string; readonly outputRoot: string };
} {
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

export function analyzer(
  name: string,
  {
    dependencies = [],
    shardWeight = 1,
  }: { readonly dependencies?: readonly string[]; readonly shardWeight?: number } = {},
): AnalyzerFixture {
  return {
    name,
    version: '1.0.0',
    configurationHash: `hash-${name}`,
    exclusions: ['generated/**'],
    dependencies,
    shardWeight,
  };
}

function shardTool(
  name: string,
  findings: readonly object[],
  {
    toolVersions,
    configurationHashes,
  }: Pick<SummaryOptions, 'toolVersions' | 'configurationHashes'>,
) {
  return {
    name,
    version: toolVersions[name] ?? '1.0.0',
    configurationHash: configurationHashes[name] ?? `hash-${name}`,
    base: 0,
    head: 0,
    new: findings.filter((finding) => fieldOf(finding, 'tool') === name).length,
    resolved: 0,
    unchanged: 0,
    changedMetrics: 0,
    baseElapsedMs: 3,
    headElapsedMs: 5,
    elapsedMs: 8,
  };
}

function shardSummary(index: number, options: SummaryOptions) {
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
  inputRoot: string,
  index: number,
  {
    tools,
    headSha = 'head',
    findings = [],
    held,
    notes,
    toolErrors = [],
    toolVersions = {},
    configurationHashes = {},
    overallStatus = 'completed',
    elapsedMs = 10,
    carried = {},
  }: ShardOptions,
): void {
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
  if (notes !== undefined) {
    writeJson(path.join(shardRoot, 'notes.json'), notes);
  }
  writeJson(path.join(shardRoot, 'tool-errors.json'), toolErrors);
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
