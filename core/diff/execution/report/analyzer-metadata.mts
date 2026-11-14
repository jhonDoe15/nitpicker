export type MetadataContext = { readonly liveProjectRoot: unknown; readonly policyRoot: unknown };

type Resolver = (root: unknown) => unknown;

type ResolvedMetadata = {
  version?: unknown;
  configurationHash?: unknown;
  readonly resolveVersion?: unknown;
  readonly resolveConfigurationHash?: unknown;
};

function isResolver(value: unknown): value is Resolver {
  return typeof value === 'function';
}

function isAnalyzerObject(value: unknown): value is ResolvedMetadata {
  return typeof value === 'object' && value !== null;
}

export function resolveAnalyzerMetadata(
  analyzer: unknown,
  { liveProjectRoot, policyRoot }: MetadataContext,
): void {
  if (!isAnalyzerObject(analyzer)) {
    return;
  }
  const { resolveVersion, resolveConfigurationHash } = analyzer;
  if (isResolver(resolveVersion)) {
    analyzer.version = resolveVersion.call(analyzer, liveProjectRoot);
  }
  if (isResolver(resolveConfigurationHash)) {
    analyzer.configurationHash = resolveConfigurationHash.call(analyzer, policyRoot);
  }
}

export function recoverAnalyzerVersion(analyzer: unknown): void {
  if (
    isAnalyzerObject(analyzer) &&
    typeof analyzer.resolveVersion === 'function' &&
    analyzer.version === 'unresolved'
  ) {
    analyzer.version = 'unknown';
  }
}
