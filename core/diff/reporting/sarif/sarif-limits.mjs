import { gzipSync } from 'node:zlib';

const BYTES_PER_MEGABYTE = 1_048_576;

export const SARIF_UPLOAD_LIMITS = { results: 25_000, gzipBytes: 10 * BYTES_PER_MEGABYTE };

function megabytes(bytes) {
  return `${String(Math.round((bytes / BYTES_PER_MEGABYTE) * 10) / 10)} MB`;
}

export function droppedResultsText({ kept, total, sources }, limits) {
  return `This file lists the first ${String(kept)} of ${String(total)} findings, because GitHub code scanning rejects a SARIF run of more than ${String(limits.results)} results or a file over ${megabytes(limits.gzipBytes)} gzipped. New findings come first, and ${sources} lists them all.`;
}

function descendingPowersOfTwo(below) {
  const count = Math.max(0, Math.ceil(Math.log2(below)));
  return Array.from({ length: count }, (_, index) => 2 ** (count - 1 - index));
}

export function renderWithinUploadLimits(entries, render, limits = SARIF_UPLOAD_LIMITS) {
  function attempt(count) {
    const text = render(entries.slice(0, count));
    return gzipSync(text).length <= limits.gzipBytes ? text : undefined;
  }
  const most = Math.min(entries.length, limits.results);
  const whole = attempt(most);
  if (whole !== undefined) {
    return whole;
  }
  let kept = 0;
  for (const step of descendingPowersOfTwo(most)) {
    if (kept + step < most && attempt(kept + step) !== undefined) {
      kept += step;
    }
  }
  return render(entries.slice(0, kept));
}
