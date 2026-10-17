import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { projectRelative } from '../../ingest/sarif.mjs';

const FORMAT_TOOLS = {
  google: { tool: 'google-java-format', flag: '' },
  aosp: { tool: 'google-java-format', flag: ' --aosp' },
  palantir: { tool: 'palantir-java-format', flag: '' },
};

export function formatFindings({ reportRoot, roots, javaStyle }) {
  const formatLines = readFileSync(path.join(reportRoot, 'format.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => projectRelative(line.trim(), roots) ?? line);
  const { tool, flag } = FORMAT_TOOLS[javaStyle] ?? FORMAT_TOOLS.google;
  return ingestFormatCheck(formatLines.join('\n'), {
    tool,
    message: `File is not formatted with ${tool}${flag}`,
  }).findings;
}
