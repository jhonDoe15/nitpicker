import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const KNIP_REPORT_FILE_VARIABLE = 'NITPICKER_KNIP_REPORT_FILE';
export const KNIP_JSON_REPORTER_VARIABLE = 'NITPICKER_KNIP_JSON_REPORTER';

type Reporter = (options: unknown) => unknown;

function isReporter(value: unknown): value is Reporter {
  return typeof value === 'function';
}

function requiredVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`The knip report file reporter needs ${name}`);
  }
  return value;
}

async function jsonReporter(): Promise<Reporter> {
  const loaded: unknown = await import(
    pathToFileURL(requiredVariable(KNIP_JSON_REPORTER_VARIABLE)).href
  );
  const reporter: unknown =
    typeof loaded === 'object' && loaded !== null && 'default' in loaded
      ? loaded.default
      : undefined;
  if (!isReporter(reporter)) {
    throw new TypeError('knip has no JSON reporter to write the report file with');
  }
  return reporter;
}

function textOfChunk(chunk: unknown): string {
  return chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : String(chunk);
}

function capturedRun(run: () => unknown, chunks: string[]): unknown {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown): boolean => {
    chunks.push(textOfChunk(chunk));
    return true;
  };
  try {
    return run();
  } finally {
    process.stdout.write = write;
  }
}

export default async function reportToFile(options: unknown): Promise<void> {
  const reporter = await jsonReporter();
  const chunks: string[] = [];
  await capturedRun(() => reporter(options), chunks);
  await writeFile(requiredVariable(KNIP_REPORT_FILE_VARIABLE), chunks.join(''));
}
