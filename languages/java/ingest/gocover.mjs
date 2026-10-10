import { coverageMetricFinding, normalizeReportPath } from './common.mjs';

const BLOCK = /^(.+):\d+\.\d+,\d+\.\d+ (\d+) (\d+)$/;

export function ingestGoCoverprofile(text, options = {}) {
  const tool = options.tool ?? 'go-cover';
  const files = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const match = BLOCK.exec(rawLine.trim());
    if (match === null) {
      continue;
    }
    const statements = Number(match[2]);
    const entry = files.get(match[1]) ?? { covered: 0, total: 0 };
    entry.total += statements;
    entry.covered += Number(match[3]) > 0 ? statements : 0;
    files.set(match[1], entry);
  }

  const findings = [];
  for (const [importPath, { covered, total }] of files) {
    const filePath = normalizeReportPath(stripModule(importPath, options.modulePath), options.root);
    if (filePath !== undefined && total > 0) {
      findings.push(
        coverageMetricFinding({ tool, path: filePath, name: 'statement-coverage', covered, total }),
      );
    }
  }
  return { findings };
}

function stripModule(importPath, modulePath) {
  if (modulePath !== undefined && importPath.startsWith(`${modulePath}/`)) {
    return importPath.slice(modulePath.length + 1);
  }
  return importPath;
}
