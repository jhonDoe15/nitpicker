const SCOPES = new Set(['compile', 'provided', 'runtime', 'test', 'system']);
const MAIN_COMPILE_SCOPES = new Set(['compile', 'provided', 'system']);
const TEST_COMPILE_SCOPES = new Set([...MAIN_COMPILE_SCOPES, 'test']);
const SCOPE_POSITIONS = [5, 4];

export function parseDependencyList(text) {
  return text
    .split(/\r?\n/u)
    .map((line) =>
      line
        .trim()
        .replace(/ -- module .*$/u, '')
        .replace(/ \(optional\)$/u, ''),
    )
    .flatMap((line) => {
      const parts = line.split(':');
      const index = SCOPE_POSITIONS.find(
        (position) => SCOPES.has(parts[position]) && position < parts.length - 1,
      );
      return index === undefined
        ? []
        : [
            {
              groupId: parts[0],
              artifactId: parts[1],
              type: parts[2],
              scope: parts[index],
              file: parts.slice(index + 1).join(':'),
            },
          ];
    });
}

function filesIn(dependencies, scopes) {
  return dependencies.filter((entry) => scopes.has(entry.scope)).map((entry) => entry.file);
}

export function moduleClasspaths(module, dependencies) {
  return {
    mainCompile: filesIn(dependencies, MAIN_COMPILE_SCOPES),
    testCompile: filesIn(dependencies, TEST_COMPILE_SCOPES),
    testRuntime: [
      module.testOutputDirectory,
      module.outputDirectory,
      ...dependencies.map((entry) => entry.file),
    ],
  };
}
