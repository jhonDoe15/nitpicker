export function indexMutationFacts(facts) {
  const files = new Map();
  for (const file of facts.files ?? []) {
    files.set(file.file, indexFile(file));
  }
  return { files };
}

function indexFile(file) {
  return {
    lines: file.lines,
    classes: new Map(file.classes.map((entry) => [entry.name, entry])),
    functions: file.functions,
    lambdas: file.lambdas,
    branching: new Set(file.branching),
    bang: new Set(file.bang),
  };
}

export function declaredClassNames(index) {
  return new Set([...index.files.values()].flatMap((file) => [...file.classes.keys()]));
}
