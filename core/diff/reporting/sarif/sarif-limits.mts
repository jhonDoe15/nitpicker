import { gzipSync } from 'node:zlib';

const BYTES_PER_MEGABYTE = 1_048_576;

export type UploadLimits = { readonly results: number; readonly gzipBytes: number };

type Dropped = {
  readonly kept: number;
  readonly total: number;
  readonly sources: string;
  readonly newFirst: boolean;
};

export const SARIF_UPLOAD_LIMITS: UploadLimits = {
  results: 25_000,
  gzipBytes: 10 * BYTES_PER_MEGABYTE,
};

function megabytes(bytes: number): string {
  return `${String(Math.round((bytes / BYTES_PER_MEGABYTE) * 10) / 10)} MB`;
}

export function droppedResultsText(
  { kept, total, sources, newFirst }: Dropped,
  limits: UploadLimits,
): string {
  const order = newFirst ? 'New findings come first, and ' : 'The rest are in ';
  const rest = newFirst ? `${sources} lists them all` : sources;
  return `This file lists the first ${String(kept)} of ${String(total)} findings, because GitHub code scanning rejects a SARIF run of more than ${String(limits.results)} results or a file over ${megabytes(limits.gzipBytes)} gzipped. ${order}${rest}.`;
}

function descendingPowersOfTwo(below: number): number[] {
  const count = Math.max(0, Math.ceil(Math.log2(below)));
  return Array.from({ length: count }, (_, index) => 2 ** (count - 1 - index));
}

export function renderWithinUploadLimits<T>(
  entries: readonly T[],
  render: (kept: readonly T[]) => string,
  limits: UploadLimits = SARIF_UPLOAD_LIMITS,
): string {
  function attempt(count: number): string | undefined {
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
