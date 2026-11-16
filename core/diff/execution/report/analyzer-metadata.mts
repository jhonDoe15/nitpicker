import { fieldOf } from '../../../../shared/values/readers.mts';

export type MetadataContext = { readonly liveProjectRoot: unknown; readonly policyRoot: unknown };

export type AnalyzerMetadata = {
  readonly version?: unknown;
  readonly configurationHash?: unknown;
  readonly versionRecovered?: true;
};

export type MetadataMap = ReadonlyMap<unknown, AnalyzerMetadata>;

export type MetadataResolution =
  | { readonly kind: 'resolved'; readonly metadata: AnalyzerMetadata }
  | { readonly kind: 'failed'; readonly metadata: AnalyzerMetadata; readonly error: unknown };

type Resolver = (root: unknown) => unknown;

type MetadataResolvers = {
  readonly resolveVersion?: unknown;
  readonly resolveConfigurationHash?: unknown;
};

function isResolver(value: unknown): value is Resolver {
  return typeof value === 'function';
}

function isAnalyzerObject(value: unknown): value is MetadataResolvers {
  return typeof value === 'object' && value !== null;
}

export function metadataValue(
  analyzer: unknown,
  property: keyof AnalyzerMetadata,
  resolved: AnalyzerMetadata | undefined,
): unknown {
  return resolved !== undefined && Object.hasOwn(resolved, property)
    ? resolved[property]
    : fieldOf(analyzer, property);
}

export function resolveAnalyzerMetadata(
  analyzer: unknown,
  { liveProjectRoot, policyRoot }: MetadataContext,
  previous: AnalyzerMetadata = {},
): MetadataResolution {
  if (!isAnalyzerObject(analyzer)) {
    return { kind: 'resolved', metadata: previous };
  }
  const { resolveVersion, resolveConfigurationHash } = analyzer;
  let metadata = previous;
  try {
    if (isResolver(resolveVersion)) {
      metadata = { ...metadata, version: resolveVersion.call(analyzer, liveProjectRoot) };
    }
    if (isResolver(resolveConfigurationHash)) {
      metadata = {
        ...metadata,
        configurationHash: resolveConfigurationHash.call(analyzer, policyRoot),
      };
    }
  } catch (error) {
    return { kind: 'failed', metadata, error };
  }
  return { kind: 'resolved', metadata };
}

export function resolvedAnalyzerMetadata(
  analyzer: unknown,
  context: MetadataContext,
  previous?: AnalyzerMetadata,
): AnalyzerMetadata {
  const resolution = resolveAnalyzerMetadata(analyzer, context, previous);
  if (resolution.kind === 'failed') {
    throw new PartialMetadataError(resolution.error, resolution.metadata);
  }
  return resolution.metadata;
}

export function recoverAnalyzerVersion(
  analyzer: unknown,
  resolved: AnalyzerMetadata | undefined,
): AnalyzerMetadata | undefined {
  if (
    isAnalyzerObject(analyzer) &&
    typeof analyzer.resolveVersion === 'function' &&
    metadataValue(analyzer, 'version', resolved) === 'unresolved'
  ) {
    return { ...resolved, version: 'unknown', versionRecovered: true };
  }
  return resolved;
}

function laterMetadata(
  earlier: AnalyzerMetadata | undefined,
  later: AnalyzerMetadata,
): AnalyzerMetadata {
  const merged = { ...earlier, ...later };
  if (later.versionRecovered === true && earlier !== undefined && 'version' in earlier) {
    return {
      ...merged,
      version: earlier.version,
      ...(earlier.versionRecovered ? { versionRecovered: true as const } : {}),
    };
  }
  return merged;
}

export function mergeMetadata(...maps: readonly (MetadataMap | undefined)[]): MetadataMap {
  const merged = new Map<unknown, AnalyzerMetadata>();
  for (const map of maps) {
    for (const [analyzer, metadata] of map ?? []) {
      merged.set(analyzer, laterMetadata(merged.get(analyzer), metadata));
    }
  }
  return merged;
}

export function withResolvedMetadata(analyzer: unknown, resolved: AnalyzerMetadata): unknown {
  if (!isAnalyzerObject(analyzer)) {
    return analyzer;
  }
  const { version, configurationHash } = resolved;
  return {
    ...analyzer,
    ...(Object.hasOwn(resolved, 'version') ? { version } : {}),
    ...(Object.hasOwn(resolved, 'configurationHash') ? { configurationHash } : {}),
  };
}

class PartialMetadataError extends Error {
  readonly metadata: AnalyzerMetadata;

  constructor(cause: unknown, metadata: AnalyzerMetadata) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.metadata = metadata;
  }
}

export function partialMetadataOf(error: unknown): AnalyzerMetadata | undefined {
  return error instanceof PartialMetadataError ? error.metadata : undefined;
}
