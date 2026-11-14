import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format as formatOutput } from 'node:util';

type ReportOutput = Pick<NodeJS.WritableStream, 'write'>;

export function printLine(output: ReportOutput, text: string): void {
  output.write(formatOutput(text) + '\n');
}

export async function writeReport({
  projectRoot,
  outputPath,
  report,
  summaryExtras = {},
  output,
}: {
  readonly projectRoot: string;
  readonly outputPath: string;
  readonly report: { readonly summary: object };
  readonly summaryExtras?: object;
  readonly output: ReportOutput;
}): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  printLine(
    output,
    JSON.stringify(
      { output: path.relative(projectRoot, outputPath), ...report.summary, ...summaryExtras },
      null,
      2,
    ),
  );
}
