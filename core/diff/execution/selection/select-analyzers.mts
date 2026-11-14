type NamedAnalyzer = {
  readonly name: string;
  readonly dependencies?: readonly string[] | undefined;
};

type Selection<T extends NamedAnalyzer> = {
  readonly analyzersByName: ReadonlyMap<string, T>;
  readonly selectedNames: Set<string>;
  readonly pendingNames: string[];
};

export function selectAnalyzers<T extends NamedAnalyzer>(
  analyzers: readonly T[],
  analyzerNames: readonly string[],
): readonly T[] {
  if (analyzerNames.length === 0) {
    return analyzers;
  }

  const analyzersByName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  const unknownNames = analyzerNames.filter((name) => !analyzersByName.has(name));
  if (unknownNames.length > 0) {
    const knownNames = analyzers
      .map((analyzer) => analyzer.name)
      .sort()
      .join(', ');
    throw new Error(
      `Unknown --analyzer: ${unknownNames.join(', ')}. Known analyzers: ${knownNames}`,
    );
  }

  const selectedNames = new Set(analyzerNames);
  const pendingNames = [...analyzerNames];
  for (const pendingName of pendingNames) {
    includeDependencies(analyzersByName.get(pendingName), {
      analyzersByName,
      selectedNames,
      pendingNames,
    });
  }

  return analyzers.filter((analyzer) => selectedNames.has(analyzer.name));
}

function includeDependencies<T extends NamedAnalyzer>(
  analyzer: T | undefined,
  { analyzersByName, selectedNames, pendingNames }: Selection<T>,
): void {
  for (const dependencyName of analyzer?.dependencies ?? []) {
    const dependency = analyzersByName.get(dependencyName);
    if (dependency === undefined) {
      throw new Error(
        `Analyzer ${String(analyzer?.name)} requires unknown analyzer ${dependencyName}`,
      );
    }
    if (!selectedNames.has(dependencyName)) {
      selectedNames.add(dependencyName);
      pendingNames.push(dependencyName);
    }
  }
}
