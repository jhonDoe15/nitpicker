import type { Finding } from '../values/findings.mts';

export function byRule(findings: readonly Finding[], rule: string): Finding[] {
  return findings.filter((finding) => finding.rule === rule);
}
