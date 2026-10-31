const MINIMUM_RANGE = /^>=\s*(?<version>\d+(?:\.\d+){0,2})$/u;

function numbers(version) {
  return version
    .replace(/^v/u, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10));
}

export function minimumNodeVersion(range) {
  return MINIMUM_RANGE.exec(range.trim())?.groups.version;
}

export function unsupportedNodeMessage(nodeVersion, range) {
  const minimum = minimumNodeVersion(range);
  if (minimum === undefined) {
    return undefined;
  }
  const actual = numbers(nodeVersion);
  const difference =
    numbers(minimum)
      .map((part, index) => (actual[index] ?? 0) - part)
      .find((delta) => delta !== 0) ?? 0;
  if (difference >= 0) {
    return undefined;
  }
  const major = minimum.split('.')[0];
  return `nitpicker needs Node.js ${minimum} or newer, and this is Node.js ${nodeVersion.replace(/^v/u, '')}. Install a newer Node.js (for example with nvm install ${major}).`;
}

export function unloadableNodeMessage(nodeVersion, range, error) {
  const minimum = minimumNodeVersion(range) ?? range;
  return `nitpicker could not load on Node.js ${nodeVersion.replace(/^v/u, '')}: ${error.message}. Use an LTS release of Node.js ${minimum} or newer.`;
}
