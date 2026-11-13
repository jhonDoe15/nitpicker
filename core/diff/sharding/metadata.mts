import { analyzerName } from '../reporting/report-model.mjs';
import { realpathSync } from 'node:fs';
import { runGit } from '../git/repository/command.mjs';
import path from 'node:path';
import { withNamedTemporaryWorktree } from '../git/repository/worktree.mjs';
import { readJson } from './read-shards.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

type ResolvableAnalyzer = {
  readonly name: string;
  version?: unknown;
  configurationHash?: unknown;
  readonly resolveVersion?: (projectRoot: string) => unknown;
  readonly resolveConfigurationHash?: (projectRoot: string) => unknown;
};

type ResolutionError = {
  readonly tool: unknown;
  readonly snapshot: string;
  readonly message: string;
};

type FailedAnalyzer = {
  readonly analyzer: ResolvableAnalyzer;
  readonly index: number;
  readonly error: unknown;
  readonly errors: ResolutionError[];
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

const nameOf: (analyzer: unknown, index: number) => unknown = analyzerName;
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
  errors: ResolutionError[],
  resolve: (analyzer: ResolvableAnalyzer) => void,
): void {
  for (const [index, analyzer] of analyzers.entries()) {
    try {
      resolve(analyzer);
    } catch (error) {
      recordAnalyzerResolutionError({ analyzer, index, error, errors });
    }
  }
}

function resolveAnalyzerVersions(
  analyzers: readonly ResolvableAnalyzer[],
  liveProjectRoot: string | undefined,
  errors: ResolutionError[],
): void {
  if (liveProjectRoot === undefined) {
    return;
  }
  resolveEachAnalyzer(analyzers, errors, (analyzer) => {
    if (typeof analyzer.resolveVersion === 'function') {
      analyzer.version = analyzer.resolveVersion(liveProjectRoot);
    }
  });
}

function resolveAnalyzerConfigurationHashes(
  analyzers: readonly ResolvableAnalyzer[],
  configurationRoot: string,
  errors: ResolutionError[],
): void {
  resolveEachAnalyzer(analyzers, errors, (analyzer) => {
    const resolveConfigurationHash = analyzer.resolveConfigurationHash;
    if (typeof resolveConfigurationHash === 'function') {
      analyzer.configurationHash = resolveConfigurationHash(configurationRoot);
    }
  });
}

function recordAnalyzerResolutionError({ analyzer, index, error, errors }: FailedAnalyzer): void {
  if (analyzer.version === 'unresolved') {
    analyzer.version = 'unknown';
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
  errors: ResolutionError[],
): void {
  const configured = [...analyzers.entries()].filter(
    ([, analyzer]) => typeof analyzer.resolveConfigurationHash === 'function',
  );
  for (const [index, analyzer] of configured) {
    recordAnalyzerResolutionError({ analyzer, index, error, errors });
  }
}

export function resolveMetadata({
  analyzers,
  liveProjectRoot,
  policyRoot,
  inputRoot,
  warn,
}: MetadataRequest): ResolutionError[] {
  const errors: ResolutionError[] = [];
  resolveAnalyzerVersions(analyzers, liveProjectRoot, errors);
  if (policyRoot !== undefined) {
    resolveAnalyzerConfigurationHashes(analyzers, policyRoot, errors);
    return errors;
  }
  if (
    liveProjectRoot === undefined ||
    !analyzers.some((analyzer) => typeof analyzer.resolveConfigurationHash === 'function')
  ) {
    return errors;
  }
  try {
    const headSha = fieldOf(readJson(path.join(inputRoot, '0'), 'summary.json', 0), 'headSha');
    withHeadProjectRoot({ liveProjectRoot, headSha, warn }, (headProjectRoot) => {
      resolveAnalyzerConfigurationHashes(analyzers, headProjectRoot, errors);
    });
  } catch (error) {
    recordConfigurationErrors(analyzers, error, errors);
  }
  return errors;
}
