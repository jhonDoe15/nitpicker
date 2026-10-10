import { normalizeReportPath } from './common.mjs';

// Formatter check output -> findings: one enforceable `format` finding per file the formatter
// would change. Input is a plain list, one file per line (google-java-format --dry-run, or any
// formatter's "files needing a reformat" listing). Identity is the constant `format`: the file path
// already is part of the comparison key, so a rename follows the file and edits never matter.

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
