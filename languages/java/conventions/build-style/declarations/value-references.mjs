const QUOTED = /^(["'])([\s\S]*)\1$/u;
const INTERPOLATED = /^\$\{?([\w.-]+)\}?$/u;
const IDENTIFIER = /^[A-Za-z_]\w*$/u;
const CATALOG_ENTRY = /^libs\.versions\.([\w.-]+?)(?:\.get\(\))?(?:\.toString\(\))?$/u;
const MAVEN_PROPERTY = /\$\{([^}]+)\}/gu;
const MAVEN_DEPTH = 5;

function normalized(name) {
  return name.toLowerCase().replaceAll(/[-_.]/gu, '.');
}

function assignedIn(text, name) {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const pattern = new RegExp(
    String.raw`(?:^|[\s;])(?:(?:val|var|def|final|String|ext\.|extra\["?)\s*)*${escaped}"?\]?\s*=\s*(["'])([^"'\n]*)\1`,
    'mu',
  );
  return pattern.exec(text)?.[2];
}

function propertyIn(text, name) {
  const pattern = new RegExp(
    String.raw`^\s*${name.replaceAll('.', String.raw`\.`)}\s*[=:]\s*(.+?)\s*$`,
    'mu',
  );
  return pattern.exec(text ?? '')?.[1];
}

function catalogVersion(toml, name) {
  const section = /\[versions\]([\s\S]*?)(?=^\[|(?![\s\S]))/mu.exec(toml ?? '')?.[1] ?? '';
  for (const line of section.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (rest.length > 0 && normalized(key.trim()) === normalized(name)) {
      return /["']([^"']+)["']/u.exec(rest.join('='))?.[1];
    }
  }
  return undefined;
}

export function gradleValue(argument, { text, properties, catalog }) {
  const trimmed = argument.trim();
  const quoted = QUOTED.exec(trimmed)?.[2];
  if (quoted !== undefined && !quoted.includes('$')) {
    return quoted;
  }
  const catalogName = CATALOG_ENTRY.exec(trimmed)?.[1];
  if (catalogName !== undefined) {
    return catalogVersion(catalog, catalogName);
  }
  const name =
    INTERPOLATED.exec(quoted ?? '')?.[1] ?? (IDENTIFIER.test(trimmed) ? trimmed : undefined);
  if (name === undefined) {
    return undefined;
  }
  return assignedIn(text, name) ?? propertyIn(properties, name);
}

function expandedOnce(current, properties) {
  return current.includes('${')
    ? current.replaceAll(MAVEN_PROPERTY, (whole, name) => properties.get(name) ?? whole)
    : current;
}

export function mavenValue(value, properties) {
  const expanded = Array.from({ length: MAVEN_DEPTH }).reduce(
    (current) => expandedOnce(current, properties),
    value.trim(),
  );
  return expanded.includes('${') ? undefined : expanded;
}
