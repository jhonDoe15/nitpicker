import { normalizeReportPath } from '../../../../shared/ingest/common.mjs';

export function reportedPath(
  file: string,
  roots: readonly (string | undefined)[],
): string | undefined {
  return roots
    .map((root) => normalizeReportPath(file, root))
    .find((candidate) => candidate !== undefined);
}
