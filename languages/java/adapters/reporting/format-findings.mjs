import { ingestCheckstyle } from '../../ingest/formatting/checkstyle.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck } from '../../../../shared/ingest/format-check.mjs';
import { projectRelative } from '../../../../shared/ingest/sarif.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../style/java-style.mjs';

export function formatFindings({ reportRoot, roots, javaStyle }) {
  const formatLines = readFileSync(path.join(reportRoot, 'format.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => projectRelative(line.trim(), roots) ?? line);
  const { tool, label, command } = JAVA_FORMATTER_TOOLS[javaStyle] ?? JAVA_FORMATTER_TOOLS.google;
  return ingestFormatCheck(formatLines.join('\n'), {
    tool,
    message: `File is not formatted with ${label}. Format it with ${command}. ${NOT_YOUR_JAVA_FORMATTER}`,
  }).findings;
}

const CHECKSTYLE_SOURCE_SET_REPORT = /^checkstyle-.+\.xml$/u;

export function checkstyleFindings({ reportRoot, roots, projectRoot, mainCheckstyle }) {
  const sourceSetReports = readdirSync(reportRoot)
    .filter((name) => CHECKSTYLE_SOURCE_SET_REPORT.test(name))
    .sort()
    .map((name) => readFileSync(path.join(reportRoot, name), 'utf8'));
  return [mainCheckstyle, ...sourceSetReports]
    .filter(Boolean)
    .flatMap((checkstyle) =>
      roots.flatMap((root) =>
        ingestCheckstyle(checkstyle, { root }).findings.filter((finding) =>
          existsSync(path.join(projectRoot, finding.path)),
        ),
      ),
    );
}
