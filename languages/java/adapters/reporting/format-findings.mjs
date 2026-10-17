import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { projectRelative } from '../../ingest/sarif.mjs';
import { JAVA_FORMATTER_TOOLS } from '../style/java-style.mjs';

const NOT_YOUR_FORMATTER =
  'Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.';

export function formatFindings({ reportRoot, roots, javaStyle }) {
  const formatLines = readFileSync(path.join(reportRoot, 'format.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => projectRelative(line.trim(), roots) ?? line);
  const { tool, label, command } = JAVA_FORMATTER_TOOLS[javaStyle] ?? JAVA_FORMATTER_TOOLS.google;
  return ingestFormatCheck(formatLines.join('\n'), {
    tool,
    message: `File is not formatted with ${label}. Format it with ${command}. ${NOT_YOUR_FORMATTER}`,
  }).findings;
}
