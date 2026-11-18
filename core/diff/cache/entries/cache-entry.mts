import { compactMetricFindings as untypedCompactMetricFindings } from '../../../../shared/report-output/metric-groups.mjs';

const compactMetricFindings: (findings: readonly unknown[]) => readonly unknown[] =
  untypedCompactMetricFindings;

export function cacheEntryText(
  key: string,
  {
    findings: parsed,
    moduleImports,
  }: { readonly findings: readonly unknown[]; readonly moduleImports?: unknown },
): string {
  const findings = compactMetricFindings(parsed);
  const entry = moduleImports === undefined ? { key, findings } : { key, findings, moduleImports };
  return `${JSON.stringify(entry)}\n`;
}
