import { normalizeReportPath } from '../../../../../shared/ingest/common.mjs';
import { ingestFormatCheck } from '../../../../../shared/ingest/format-check.mjs';
import { formatAdvice } from '../../../../../shared/messages/format/format-advice.mjs';
import { ingestMypy, ingestPyright } from '../../../ingest/typed/type-check-views.mts';
import { PYTHON_ANALYZER_NAME } from '../../python-analyzer.mjs';
import type { IngestedFinding, Manifest, TypesReport } from './report-types.mts';

const FORMATTER_TOOLS: Readonly<Record<string, string>> = { ruff: 'ruff-format', black: 'black' };
const NO_TESTS_RULE = 'no-tests-ran';
const TYPE_INGESTERS: Readonly<
  Record<string, (output: string, roots: readonly string[]) => IngestedFinding[]>
> = {
  mypy: (output: string, roots: readonly string[]) => ingestMypy(output, { roots }),
  pyright: (output: string, roots: readonly string[]) => ingestPyright(output, { roots }),
  basedpyright: (output: string, roots: readonly string[]) =>
    ingestPyright(output, { roots, tool: 'basedpyright' }),
};

export function typeFindings(
  { checker, output }: TypesReport,
  roots: readonly string[],
): IngestedFinding[] {
  const ingest = TYPE_INGESTERS[checker];
  if (ingest === undefined) {
    throw new Error(`Unknown type checker: ${checker}`);
  }
  return ingest(output, roots);
}

export function noTestsFinding(): IngestedFinding {
  return {
    tool: PYTHON_ANALYZER_NAME,
    rule: NO_TESTS_RULE,
    path: '.',
    identity: NO_TESTS_RULE,
    message: 'No tests ran. Keep the project tests, or restore the ones this change removed.',
    classification: 'enforceable',
  };
}

function formatMessage({ formatter, formatterDetected }: Manifest): string {
  const base = `File is not formatted with ${formatter}`;
  const detected = formatterDetected ? ' (detected; set "python.formatter" if wrong)' : '';
  return `${base}${detected}. ${formatAdvice()}`;
}

export function formatFindings(
  text: string,
  { roots, manifest }: { roots: readonly string[]; manifest: Manifest },
): IngestedFinding[] {
  const lines = text
    .split(/\r?\n/)
    .map(
      (line) =>
        roots
          .map((root) => normalizeReportPath(line.trim(), root))
          .find((candidate) => candidate !== undefined) ?? line,
    );
  return ingestFormatCheck(lines.join('\n'), {
    tool: FORMATTER_TOOLS[manifest.formatter],
    message: formatMessage(manifest),
  }).findings;
}
