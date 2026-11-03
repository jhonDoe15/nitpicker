const FILE_KEYS = ['file', 'lines', 'classes', 'functions', 'lambdas', 'branching', 'casts'];

export function indexMutationFacts(facts) {
  if (!Array.isArray(facts?.files)) {
    throw new TypeError('the report has no "files" list');
  }
  const files = new Map();
  for (const file of facts.files) {
    const missing = FILE_KEYS.filter((key) => file?.[key] === undefined);
    if (missing.length > 0) {
      throw new TypeError(`the entry of ${file?.file ?? 'a file'} lacks ${missing.join(', ')}`);
    }
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
    casts: new Set(file.casts),
  };
}

export function declaredClassNames(index) {
  return new Set([...index.files.values()].flatMap((file) => [...file.classes.keys()]));
}
