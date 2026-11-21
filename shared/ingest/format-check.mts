import type { Finding } from '../values/findings.mts';
import { normalizeReportPath } from './report-records.mts';
import type { FormatCheckOptions } from './typed/report-types.mts';

export function ingestFormatCheck(
  text: string,
  options: FormatCheckOptions = {},
): { readonly findings: Finding[] } {
  const tool = options.tool ?? 'formatter';
  const message = options.message ?? 'File is not formatted';
  const seen = new Set<string>();
  const findings: Finding[] = [];
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
