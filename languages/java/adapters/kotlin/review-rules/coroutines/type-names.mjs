const IMPLICIT_PACKAGES = ['java.lang', 'kotlin', 'kotlin.io', 'kotlin.collections', 'kotlin.text'];

export function resolverFor(file) {
  const explicit = new Map();
  const wildcards = [];
  for (const { path, alias, all } of file.imports) {
    if (all) {
      wildcards.push(path);
    } else {
      explicit.set(alias ?? path.slice(path.lastIndexOf('.') + 1), path);
    }
  }
  const candidates = (name) => {
    if (name.includes('.')) {
      return [name];
    }
    if (explicit.has(name)) {
      return [explicit.get(name)];
    }
    return [...wildcards, ...IMPLICIT_PACKAGES].map((pkg) => `${pkg}.${name}`);
  };
  return {
    isType: (name, qualified) => name !== undefined && candidates(name).includes(qualified),
    importsFrom: (prefix) => file.imports.some(({ path }) => path.startsWith(prefix)),
    isImported: (name) => explicit.has(name),
    explicitPath: (name) => explicit.get(name),
  };
}
