const DEFAULT_PACKAGES = [
  'kotlin',
  'kotlin.annotation',
  'kotlin.collections',
  'kotlin.comparisons',
  'kotlin.io',
  'kotlin.ranges',
  'kotlin.sequences',
  'kotlin.text',
  'kotlin.jvm',
  'java.lang',
];

export function parseImport(text) {
  const match = /^import\s+([\w.`]+?)(\.\*)?(?:\s+as\s+(\w+))?\s*$/s.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  const path = match[1].replaceAll('`', '');
  return match[2] === undefined
    ? { path, name: match[3] ?? path.slice(path.lastIndexOf('.') + 1) }
    : { star: path };
}

export function createResolver({ imports, packageName }) {
  const explicit = new Map(
    imports.filter(({ name }) => name).map(({ name, path }) => [name, path]),
  );
  const stars = imports.filter(({ star }) => star).map(({ star }) => star);
  const locals = [packageName, ...stars, ...DEFAULT_PACKAGES].filter((value) => value !== '');
  function candidates(written) {
    const [head, ...rest] = written.split('.');
    if (explicit.has(head)) {
      return [[explicit.get(head), ...rest].join('.')];
    }
    return rest.length > 0 ? [written] : locals.map((prefix) => `${prefix}.${written}`);
  }
  return {
    candidates,
    matches: (written, names) => candidates(written).some((candidate) => names.has(candidate)),
    fullName: (written) => candidates(written)[0],
  };
}
