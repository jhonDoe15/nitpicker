import {
  createIdentityCounter,
  hashIdentity as untypedHashIdentity,
  normalizeReportPath as untypedNormalizeReportPath,
} from '../../../../shared/ingest/common.mjs';
import { childrenNamed, parseXml } from '../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../shared/values/xml.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';

type CheckstyleOptions = { readonly root?: string; readonly tool?: string };
type Attributes = XmlElement['attrs'];

const identityCounter: () => (identity: string) => string = createIdentityCounter;
const hashIdentity: (prefix: string, parts: readonly string[]) => string = untypedHashIdentity;
const normalizeReportPath: (value: string, root: string | undefined) => string | undefined =
  untypedNormalizeReportPath;

const CHECKSTYLE = 'checkstyle';
const ERROR = 'error';
const ENFORCEABLE_SEVERITIES = new Set([ERROR, 'warning']);
const LINE_NUMBER = /\bline '?\d+'?/gu;

export function ingestCheckstyle(
  xml: string,
  options: CheckstyleOptions = {},
): { findings: JavaFinding[] } {
  const report = parseXml(xml);
  if (report.name !== CHECKSTYLE) {
    throw new TypeError('Checkstyle report root element must be <checkstyle>');
  }
  const findings = childrenNamed(report, 'file').flatMap((file) => fileFindings(file, options));
  return { findings };
}

function nonEmpty(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value;
}

function errorLocation(attrs: Attributes): { location?: { line: number; column?: number } } {
  const line = Number.parseInt(attrs['line'] ?? '', 10);
  if (!(line >= 1)) {
    return {};
  }
  const column = Number.parseInt(attrs['column'] ?? '', 10);
  return { location: { line, ...(column >= 1 ? { column } : {}) } };
}

function fileFindings(file: XmlElement, options: CheckstyleOptions): JavaFinding[] {
  const filePath = normalizeReportPath(file.attrs['name'] ?? '', options.root);
  if (filePath === undefined) {
    return [];
  }
  const unique = identityCounter();
  return childrenNamed(file, ERROR).map((error): JavaFinding => {
    const rule = nonEmpty(error.attrs['source'], CHECKSTYLE);
    const message = nonEmpty(error.attrs['message'], rule);
    return {
      tool: options.tool ?? CHECKSTYLE,
      rule,
      path: filePath,
      identity: unique(hashIdentity(CHECKSTYLE, [rule, message.replace(LINE_NUMBER, 'line')])),
      message,
      classification: ENFORCEABLE_SEVERITIES.has(error.attrs['severity'] ?? ERROR)
        ? 'enforceable'
        : 'descriptive',
      ...errorLocation(error.attrs),
    };
  });
}
