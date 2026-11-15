const MINIMUM_RANGE = /^>=\s*(?<version>\d+(?:\.\d+){0,2})$/u;

function numbers(version: string): number[] {
  return version
    .replace(/^v/u, '')
    .split('.')
    .map((part: string) => Number.parseInt(part, 10));
}

export function versionDifference(nodeVersion: string, minimum: string): number {
  const actual = numbers(nodeVersion);
  return (
    numbers(minimum)
      .map((part, index) => (actual[index] ?? 0) - part)
      .find((delta) => delta !== 0) ?? 0
  );
}

export function minimumNodeVersion(range: string): string | undefined {
  return MINIMUM_RANGE.exec(range.trim())?.groups?.['version'];
}

export function unsupportedNodeMessage(nodeVersion: string, range: string): string | undefined {
  const minimum = minimumNodeVersion(range);
  if (minimum === undefined) {
    return undefined;
  }
  if (versionDifference(nodeVersion, minimum) >= 0) {
    return undefined;
  }
  const major = minimum.split('.')[0] ?? minimum;
  return `nitpicker needs Node.js ${minimum} or newer, and this is Node.js ${nodeVersion.replace(/^v/u, '')}. Install a newer Node.js (for example with nvm install ${major}).`;
}

export function unloadableNodeMessage(nodeVersion: string, range: string, error: Error): string {
  const minimum = minimumNodeVersion(range) ?? range;
  return `nitpicker could not load on Node.js ${nodeVersion.replace(/^v/u, '')}: ${error.message}. Use an LTS release of Node.js ${minimum} or newer.`;
}
