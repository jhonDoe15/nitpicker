import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const REPORT_BASE = 'gradle-reports';
export const ROOT_KEY = 'root';

export function reportBaseOf(root) {
  return path.join(root, REPORT_BASE);
}

export function rootReports(root) {
  return path.join(reportBaseOf(root), ROOT_KEY);
}

export function writeModules(root, modules = [{ key: ROOT_KEY, path: ':', dir: '' }]) {
  mkdirSync(reportBaseOf(root), { recursive: true });
  writeFileSync(path.join(reportBaseOf(root), 'modules.json'), JSON.stringify(modules));
}

export function readingFrom(readFindings) {
  return (root, options) => readFindings(root, { reportBase: reportBaseOf(root), ...options });
}
