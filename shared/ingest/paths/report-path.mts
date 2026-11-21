export function normalizeReportPath(value: string, root?: string): string | undefined {
  let candidate = value.replaceAll('\\', '/');
  if (root !== undefined) {
    const prefix = `${root.replaceAll('\\', '/').replace(/\/+$/, '')}/`;
    if (candidate.startsWith(prefix)) {
      candidate = candidate.slice(prefix.length);
    }
  }
  candidate = candidate.replace(/^(\.\/)+/, '');
  if (
    candidate === '' ||
    candidate.includes('\0') ||
    /^(\/|[A-Za-z]:\/|\.\.(\/|$))/.test(candidate)
  ) {
    return undefined;
  }
  return candidate;
}
