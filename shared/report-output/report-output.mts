import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format as formatOutput } from 'node:util';

export function printLine(text: string): void {
  process.stdout.write(formatOutput(text) + '\n');
}

export async function writeReport({
  projectRoot,
  outputPath,
  report,
  summaryExtras = {},
}: {
  readonly projectRoot: string;
  readonly outputPath: string;
  readonly report: { readonly summary: object };
  readonly summaryExtras?: object;
}): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  printLine(
    JSON.stringify(
      { output: path.relative(projectRoot, outputPath), ...report.summary, ...summaryExtras },
      null,
      2,
    ),
  );
}
