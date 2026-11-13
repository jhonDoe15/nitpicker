import type { Classpaths, Dependency, MavenModule } from '../typed/maven-values.mts';

const SCOPES = new Set(['compile', 'provided', 'runtime', 'test', 'system']);
const MAIN_COMPILE_SCOPES = new Set(['compile', 'provided', 'system']);
const MAIN_RUNTIME_SCOPES = new Set([...MAIN_COMPILE_SCOPES, 'runtime']);
const TEST_COMPILE_SCOPES = new Set([...MAIN_COMPILE_SCOPES, 'test']);
const SCOPE_POSITIONS = [5, 4];

function dependencyOf(line: string): Dependency[] {
  const parts = line.split(':');
  const index = SCOPE_POSITIONS.find(
    (position) => SCOPES.has(parts[position] ?? '') && position < parts.length - 1,
  );
  if (index === undefined) {
    return [];
  }
  const [groupId = '', artifactId = '', type = ''] = parts;
  return [
    {
      groupId,
      artifactId,
      type,
      scope: parts[index] ?? '',
      file: parts.slice(index + 1).join(':'),
    },
  ];
}

export function parseDependencyList(text: string): Dependency[] {
  return text
    .split(/\r?\n/u)
    .map((line) =>
      line
        .trim()
        .replace(/ -- module .*$/u, '')
        .replace(/ \(optional\)$/u, ''),
    )
    .flatMap(dependencyOf);
}

function filesIn(dependencies: readonly Dependency[], scopes: ReadonlySet<string>): string[] {
  return dependencies.filter((entry) => scopes.has(entry.scope)).map((entry) => entry.file);
}

export function moduleClasspaths(
  module: MavenModule,
  dependencies: readonly Dependency[],
): Classpaths {
  return {
    mainCompile: filesIn(dependencies, MAIN_COMPILE_SCOPES),
    mainRuntime: filesIn(dependencies, MAIN_RUNTIME_SCOPES),
    testCompile: filesIn(dependencies, TEST_COMPILE_SCOPES),
    testRuntime: [
      module['testOutputDirectory'],
      module['outputDirectory'],
      ...dependencies.map((entry) => entry.file),
    ],
  };
}
