import { normalizeReportPath } from './common.mjs';

export function ingestFormatCheck(text, options = {}) {
  const tool = options.tool ?? 'formatter';
  const message = options.message ?? 'File is not formatted';
  const seen = new Set();
  const findings = [];
  for (const line of text.split(/\r?\n/)) {
    const filePath = normalizeReportPath(line.trim(), options.root);
    if (line.trim() === '' || filePath === undefined || seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    findings.push({
      tool,
      rule: 'format',
      path: filePath,
      identity: 'format',
      message,
      classification: 'enforceable',
    });
  }
  return { findings };
}
