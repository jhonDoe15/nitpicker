import {
  childrenNamed,
  createIdentityCounter,
  hashIdentity,
  normalizeReportPath,
  parseXml,
} from '../common.mjs';

const ENFORCEABLE_SEVERITIES = new Set(['error', 'warning']);

export function ingestCheckstyle(xml, options = {}) {
  const report = parseXml(xml);
  if (report.name !== 'checkstyle') {
    throw new TypeError('Checkstyle report root element must be <checkstyle>');
  }
  const findings = childrenNamed(report, 'file').flatMap((file) => fileFindings(file, options));
  return { findings };
}

function errorLocation(attrs) {
  const line = Number.parseInt(attrs.line, 10);
  if (!(line >= 1)) return {};
  const column = Number.parseInt(attrs.column, 10);
  return { location: { line, ...(column >= 1 ? { column } : {}) } };
}

function fileFindings(file, options) {
  const filePath = normalizeReportPath(file.attrs.name ?? '', options.root);
  if (filePath === undefined) return [];
  const unique = createIdentityCounter();
  return childrenNamed(file, 'error').map((error) => {
    const rule = error.attrs.source || 'checkstyle';
    const message = error.attrs.message || rule;
    return {
      tool: options.tool ?? 'checkstyle',
      rule,
      path: filePath,
      identity: unique(hashIdentity('checkstyle', [rule, filePath, message])),
      message,
      classification: ENFORCEABLE_SEVERITIES.has(error.attrs.severity ?? 'error')
        ? 'enforceable'
        : 'descriptive',
      ...errorLocation(error.attrs),
    };
  });
}
