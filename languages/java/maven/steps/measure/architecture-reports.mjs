import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ARCHITECTURE_REPORT = /^TEST-.*(?:ArchTest|ArchitectureTest)\.xml$/u;

export function collectArchitectureReports(context) {
  const { module, reportRoot, architecture } = context;
  const reports = path.join(module.buildDirectory, 'surefire-reports');
  if (!architecture || !existsSync(reports)) {
    return;
  }
  const names = readdirSync(reports).filter((name) => ARCHITECTURE_REPORT.test(name));
  if (names.length === 0) {
    return;
  }
  const target = path.join(reportRoot, 'archunit');
  mkdirSync(target, { recursive: true });
  for (const name of names) {
    copyFileSync(path.join(reports, name), path.join(target, name));
  }
}
