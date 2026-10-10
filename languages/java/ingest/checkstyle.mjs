import {
  childrenNamed,
  createIdentityCounter,
  hashIdentity,
  normalizeReportPath,
  parseXml,
} from './common.mjs';

// Checkstyle XML -> findings. Identity hashes rule (the check's `source`), path and message;
// the message names the offending token, the line number is only kept as location.
// Repeats of the same message in a file are numbered in report order.

const ENFORCEABLE_SEVERITIES = new Set(['error', 'warning']);

export function ingestCheckstyle(xml, options = {}) {
  const report = parseXml(xml);
  if (report.name !== 'checkstyle') {
    throw new TypeError('Checkstyle report root element must be <checkstyle>');
  }
  const tool = options.tool ?? 'checkstyle';
  const findings = [];
  for (const file of childrenNamed(report, 'file')) {
    const filePath = normalizeReportPath(file.attrs.name ?? '', options.root);
    if (filePath === undefined) {
      continue;
    }
    const unique = createIdentityCounter();
    for (const error of childrenNamed(file, 'error')) {
      const rule = error.attrs.source || 'checkstyle';
      const message = error.attrs.message || rule;
      const finding = {
        tool,
        rule,
        path: filePath,
        identity: unique(hashIdentity('checkstyle', [rule, filePath, message])),
        message,
        classification: ENFORCEABLE_SEVERITIES.has(error.attrs.severity ?? 'error')
          ? 'enforceable'
          : 'descriptive',
      };
      const line = Number.parseInt(error.attrs.line, 10);
      if (line >= 1) {
        finding.location = { line };
        const column = Number.parseInt(error.attrs.column, 10);
        if (column >= 1) {
          finding.location.column = column;
        }
      }
      findings.push(finding);
    }
  }
  return { findings };
}
