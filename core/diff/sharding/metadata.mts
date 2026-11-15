import { analyzerName as nameOf } from '../reporting/report-model.mts';
import { realpathSync } from 'node:fs';
import { runGit } from '../git/repository/command.mjs';
import path from 'node:path';
import { withNamedTemporaryWorktree } from '../git/repository/worktree.mjs';
import { readJson } from './read-shards.mts';
import {
  type AnalyzerMetadata,
  type MetadataMap,
  metadataValue,
} from '../execution/report/analyzer-metadata.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

type ResolvableAnalyzer = {
  readonly name: string;
  readonly version?: unknown;
  readonly configurationHash?: unknown;
  readonly resolveVersion?: (projectRoot: string) => unknown;
  readonly resolveConfigurationHash?: (projectRoot: string) => unknown;
};

type ResolutionError = {
  readonly tool: unknown;
  readonly snapshot: string;
  readonly message: string;
};

type Ledger = Map<unknown, AnalyzerMetadata>;

export type ShardMetadata = {
  readonly errors: ResolutionError[];
  readonly metadata: MetadataMap;
};

type FailedAnalyzer = {
  readonly analyzer: ResolvableAnalyzer;
  readonly index: number;
  readonly error: unknown;
  readonly errors: ResolutionError[];
  readonly ledger: Ledger;
};

type HeadRoot = {
  readonly liveProjectRoot: string;
  readonly headSha: unknown;
  readonly warn: (message: string) => unknown;
};

type MetadataRequest = {
  readonly analyzers: readonly ResolvableAnalyzer[];
  readonly liveProjectRoot: string | undefined;
  readonly policyRoot: string | undefined;
  readonly inputRoot: string;
  readonly warn: (message: string) => unknown;
};

const git: (root: string, args: readonly string[]) => string = runGit;
const inWorktree: (
  repositoryRoot: string,
  snapshot: {
    readonly commitSha: string;
    readonly directoryName: string;
    readonly warn: (message: string) => unknown;
  },
  operation: (worktreeRoot: string) => unknown,
) => unknown = withNamedTemporaryWorktree;

function resolveEachAnalyzer(
  analyzers: readonly ResolvableAnalyzer[],
  { errors, ledger }: { readonly errors: ResolutionError[]; readonly ledger: Ledger },
  resolve: (analyzer: ResolvableAnalyzer) => void,
): void {
  for (const [index, analyzer] of analyzers.entries()) {
    try {
      resolve(analyzer);
    } catch (error) {
      recordAnalyzerResolutionError({ analyzer, index, error, errors, ledger });
    }
  }
}

function resolveAnalyzerVersions(
  analyzers: readonly ResolvableAnalyzer[],
  liveProjectRoot: string | undefined,
  tracking: { readonly errors: ResolutionError[]; readonly ledger: Ledger },
): void {
  if (liveProjectRoot === undefined) {
    return;
  }
  resolveEachAnalyzer(analyzers, tracking, (analyzer) => {
    if (typeof analyzer.resolveVersion === 'function') {
      const version = analyzer.resolveVersion(liveProjectRoot);
      tracking.ledger.set(analyzer, { ...tracking.ledger.get(analyzer), version });
    }
  });
}

function resolveAnalyzerConfigurationHashes(
  analyzers: readonly ResolvableAnalyzer[],
  configurationRoot: string,
  tracking: { readonly errors: ResolutionError[]; readonly ledger: Ledger },
): void {
  resolveEachAnalyzer(analyzers, tracking, (analyzer) => {
    const resolveConfigurationHash = analyzer.resolveConfigurationHash;
    if (typeof resolveConfigurationHash === 'function') {
      const configurationHash = resolveConfigurationHash(configurationRoot);
      tracking.ledger.set(analyzer, { ...tracking.ledger.get(analyzer), configurationHash });
    }
  });
}

function recordAnalyzerResolutionError({
  analyzer,
  index,
  error,
  errors,
  ledger,
}: FailedAnalyzer): void {
  const resolved = ledger.get(analyzer);
  if (metadataValue(analyzer, 'version', resolved) === 'unresolved') {
    ledger.set(analyzer, { ...resolved, version: 'unknown' });
  }
  const tool = nameOf(analyzer, index);
  if (!errors.some((resolutionError) => resolutionError.tool === tool)) {
    errors.push({
      tool,
      snapshot: 'aggregation',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function withHeadProjectRoot(
  { liveProjectRoot, headSha, warn }: HeadRoot,
  operation: (headProjectRoot: string) => void,
): void {
  if (typeof headSha !== 'string' || headSha.length === 0) {
    throw new Error('Shard 0 has no headSha for policy resolution');
  }
  const liveRoot = realpathSync(liveProjectRoot);
  const repositoryRoot = realpathSync(git(liveRoot, ['rev-parse', '--show-toplevel']).trim());
  const projectRelativePath = path.relative(repositoryRoot, liveRoot);
  if (
    projectRelativePath === '..' ||
    projectRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(projectRelativePath)
  ) {
    throw new Error('Live project root is outside its Git repository');
  }
  inWorktree(
    repositoryRoot,
    { commitSha: headSha, directoryName: 'head', warn },
    (headWorktreeRoot) => {
      operation(path.join(headWorktreeRoot, projectRelativePath));
    },
  );
}

function recordConfigurationErrors(
  analyzers: readonly ResolvableAnalyzer[],
  error: unknown,
  { errors, ledger }: { readonly errors: ResolutionError[]; readonly ledger: Ledger },
): void {
  const configured = [...analyzers.entries()].filter(
    ([, analyzer]) => typeof analyzer.resolveConfigurationHash === 'function',
  );
  for (const [index, analyzer] of configured) {
    recordAnalyzerResolutionError({ analyzer, index, error, errors, ledger });
  }
}

export function resolveMetadata({
  analyzers,
  liveProjectRoot,
  policyRoot,
  inputRoot,
  warn,
}: MetadataRequest): ShardMetadata {
  const errors: ResolutionError[] = [];
  const ledger: Ledger = new Map();
  const tracking = { errors, ledger };
  resolveAnalyzerVersions(analyzers, liveProjectRoot, tracking);
  if (policyRoot !== undefined) {
    resolveAnalyzerConfigurationHashes(analyzers, policyRoot, tracking);
    return { errors, metadata: ledger };
  }
  if (
    liveProjectRoot === undefined ||
    !analyzers.some((analyzer) => typeof analyzer.resolveConfigurationHash === 'function')
  ) {
    return { errors, metadata: ledger };
  }
  try {
    const headSha = fieldOf(readJson(path.join(inputRoot, '0'), 'summary.json', 0), 'headSha');
    withHeadProjectRoot({ liveProjectRoot, headSha, warn }, (headProjectRoot) => {
      resolveAnalyzerConfigurationHashes(analyzers, headProjectRoot, tracking);
    });
  } catch (error) {
    recordConfigurationErrors(analyzers, error, tracking);
  }
  return { errors, metadata: ledger };
}

export function resolvedExpectations(
  analyzers: readonly ResolvableAnalyzer[],
  metadata: MetadataMap,
): { name: string; version: unknown; configurationHash: unknown }[] {
  return analyzers.map((analyzer) => ({
    name: analyzer.name,
    version: metadataValue(analyzer, 'version', metadata.get(analyzer)),
    configurationHash: metadataValue(analyzer, 'configurationHash', metadata.get(analyzer)),
  }));
}
