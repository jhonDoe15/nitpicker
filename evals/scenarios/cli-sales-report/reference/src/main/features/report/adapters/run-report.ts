import { failureText, USAGE } from '../domain/failure-text.js';
import { renderReport } from '../domain/render-report.js';
import { summarizeSales } from '../domain/summarize-sales.js';
import { loadSales } from './load-sales.js';
import { parseOptions } from './parse-options.js';

type Writer = { readonly write: (text: string) => void };

type ReportIo = {
  readonly readFile: (path: string) => Promise<string>;
  readonly stdout: Writer;
  readonly stderr: Writer;
};

export async function runReport(argv: readonly string[], io: ReportIo): Promise<number> {
  const parsed = parseOptions(argv);
  if (parsed.kind === 'failure') {
    io.stderr.write(failureText(parsed, [USAGE]));
    return 2;
  }
  const loaded = await loadSales(parsed.options.input, io.readFile);
  if (loaded.kind === 'failure') {
    io.stderr.write(failureText(loaded, []));
    return 1;
  }
  io.stdout.write(
    renderReport(summarizeSales(loaded.sales, parsed.options), parsed.options.format),
  );
  return 0;
}
