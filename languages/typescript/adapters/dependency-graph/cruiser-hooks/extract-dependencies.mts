import { SKIPPED_FILE_MARKER } from '../shared-graph/cruiser-process.mts';

type Extract = (fileName: string, ...options: unknown[]) => unknown[];
type TextOutput = { write(text: string): unknown };

const AFOUL_HEADER = /^Extracting dependencies ran afoul of\.\.\./u;
const AFOUL_FOOTER = /^\.\.\. in /u;

const originalUrl = new URL(import.meta.url).searchParams.get('original');
const original =
  originalUrl === null ? undefined : ((await import(originalUrl)) as { default: Extract }).default;

export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !AFOUL_HEADER.test(line) && !AFOUL_FOOTER.test(line));
  return lines.join(' ') || message.trim();
}

export function isolatedExtract(extract: Extract, output: TextOutput = process.stderr): Extract {
  return (fileName, ...options) => {
    try {
      return extract(fileName, ...options);
    } catch (error) {
      output.write(
        `${SKIPPED_FILE_MARKER}${JSON.stringify({ file: fileName, reason: failureReason(error) })}\n`,
      );
      return [];
    }
  };
}

export default function getDependencies(fileName: string, ...options: unknown[]): unknown[] {
  if (original === undefined) {
    throw new Error('extract-dependencies replacement loaded without the original module');
  }
  return isolatedExtract(original)(fileName, ...options);
}
