import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isCompositionRoot } from './kotlin-scan.mjs';
import { lineText, scanKotlinSource } from './kotlin-source.mjs';

const FORBIDDEN_CALL = 'detekt.style.ForbiddenMethodCall';
const SPREAD = 'detekt.performance.SpreadOperator';
const ENVIRONMENT = '`java.lang.System.getenv`';
const SPRING_ENTRY = /\brunApplication\s*<|\bSpringApplication\s*\.\s*run\s*\(/;

function sourceReader(projectRoot) {
  const scans = new Map();
  return (file) => {
    if (!scans.has(file)) {
      const absolute = path.join(projectRoot, file);
      scans.set(
        file,
        existsSync(absolute) ? scanKotlinSource(readFileSync(absolute, 'utf8')) : undefined,
      );
    }
    return scans.get(file);
  };
}

function isAllowed(finding, source, spring) {
  if (finding.rule === FORBIDDEN_CALL && finding.message.includes(ENVIRONMENT)) {
    const scanned = source(finding.path);
    return scanned !== undefined && isCompositionRoot(scanned);
  }
  if (spring && finding.rule === SPREAD && finding.location?.line !== undefined) {
    const scanned = source(finding.path);
    return scanned !== undefined && SPRING_ENTRY.test(lineText(scanned, finding.location.line));
  }
  return false;
}

export function withFrameworkAllowances(findings, { projectRoot, spring = false }) {
  const source = sourceReader(projectRoot);
  return findings.filter((finding) => !isAllowed(finding, source, spring));
}
