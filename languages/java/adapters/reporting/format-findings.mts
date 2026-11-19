import { ingestCheckstyle as untypedIngestCheckstyle } from '../../ingest/formatting/checkstyle.mts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck as untypedIngestFormatCheck } from '../../../../shared/ingest/format-check.mjs';
import { projectRelative as untypedProjectRelative } from '../../../../shared/ingest/sarif.mjs';
import { containedPath as untypedContainedPath } from '../../../../shared/paths/contained-path.mjs';
import { formatAdvice } from '../../../../shared/messages/format/format-advice.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../style/java-style.mts';

const containedPath: (
  root: string,
  relative: string,
  options: { readonly outside: (relative: string) => string },
) => string = untypedContainedPath;

type FormatFinding = { readonly path: string; readonly [field: string]: unknown };
type FormatRequest = {
  readonly reportRoot: string;
  readonly roots: readonly string[];
  readonly javaStyle: string;
};
type CheckstyleRequest = {
  readonly reportRoot: string;
  readonly roots: readonly string[];
  readonly projectRoot: string;
  readonly mainCheckstyle: string | undefined;
};

const ingestCheckstyle: (
  xml: string,
  options: { readonly root: string },
) => { readonly findings: readonly FormatFinding[] } = untypedIngestCheckstyle;
const ingestFormatCheck: (
  text: string,
  options: { readonly tool: string; readonly message: string },
) => { readonly findings: readonly FormatFinding[] } = untypedIngestFormatCheck;
const projectRelative: (uri: string, roots: readonly string[]) => string | undefined =
  untypedProjectRelative;

export function formatFindings({
  reportRoot,
  roots,
  javaStyle,
}: FormatRequest): readonly FormatFinding[] {
  const formatLines = readFileSync(path.join(reportRoot, 'format.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => projectRelative(line.trim(), roots) ?? line);
  const { tool } = JAVA_FORMATTER_TOOLS[javaStyle] ?? JAVA_FORMATTER_TOOLS.google;
  return ingestFormatCheck(formatLines.join('\n'), {
    tool,
    message: javaFormatMessage(javaStyle),
  }).findings;
}

export function javaFormatMessage(javaStyle: string): string {
  const { label } = JAVA_FORMATTER_TOOLS[javaStyle] ?? JAVA_FORMATTER_TOOLS.google;
  return `File is not formatted with ${label}. ${formatAdvice()} ${NOT_YOUR_JAVA_FORMATTER}`;
}

const CHECKSTYLE_SOURCE_SET_REPORT = /^checkstyle-.+\.xml$/u;

export function checkstyleFindings({
  reportRoot,
  roots,
  projectRoot,
  mainCheckstyle,
}: CheckstyleRequest): FormatFinding[] {
  const sourceSetReports = readdirSync(reportRoot)
    .filter((name) => CHECKSTYLE_SOURCE_SET_REPORT.test(name))
    .sort()
    .map((name) => readFileSync(containedFilePath(reportRoot, name), 'utf8'));
  return [mainCheckstyle, ...sourceSetReports]
    .filter((checkstyle): checkstyle is string => Boolean(checkstyle))
    .flatMap((checkstyle) =>
      roots.flatMap((root) =>
        ingestCheckstyle(checkstyle, { root }).findings.filter((finding) =>
          existsSync(containedFilePath(projectRoot, finding.path)),
        ),
      ),
    );
}

function containedFilePath(reportRoot: string, name: string): string {
  return containedPath(reportRoot, name, {
    outside: (relative) => `Report path escapes its directory: ${relative}`,
  });
}
