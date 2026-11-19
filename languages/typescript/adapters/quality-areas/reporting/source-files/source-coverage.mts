import path from 'node:path';
import { readLayout } from '../../../typed/head-policy.mts';
import type { CoverageReport } from '../../typed/reporting.mts';

export function sourceFilesCoverage(report: CoverageReport, projectRoot: string): CoverageReport {
  const layout = readLayout();
  return Object.fromEntries(
    Object.entries(report).filter(([file]) =>
      layout.isSourceFile(path.relative(projectRoot, file).replaceAll('\\', '/')),
    ),
  );
}
