import { normalizeReportPath } from '../paths/report-path.mts';

function decodeOrKeepRawUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch (error) {
    if (error instanceof URIError) {
      return uri;
    }
    throw error;
  }
}

export function normalizeUri(uri: string, root?: string): string | undefined {
  let candidate = decodeOrKeepRawUri(uri)
    .replace(/^file:\/\//, '')
    .replaceAll('\\', '/');
  if (/^\/[A-Za-z]:\//.test(candidate)) {
    candidate = candidate.slice(1);
  }
  return normalizeReportPath(candidate, root);
}
