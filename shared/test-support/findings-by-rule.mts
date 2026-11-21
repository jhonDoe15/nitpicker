import path from 'node:path';
import type { Finding } from '../values/findings.mts';

export function byRule(findings: readonly Finding[], rule: string): Finding[] {
  return findings.filter((finding) => finding.rule === rule);
}

export function summarize(findings: readonly Finding[]): string[] {
  return findings
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`)
    .sort();
}
