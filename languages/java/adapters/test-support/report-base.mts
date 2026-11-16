import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPORT_BASE = 'gradle-reports';
type ModuleEntry = { readonly key: string; readonly path: string; readonly dir: string };
type ReadOptions = { readonly reportBase?: string } & Readonly<Record<string, unknown>>;

const ROOT_KEY = 'root';

export function reportBaseOf(root: string): string {
  return path.join(root, REPORT_BASE);
}

export function rootReports(root: string): string {
  return path.join(reportBaseOf(root), ROOT_KEY);
}

export function writeModules(
  root: string,
  modules: readonly ModuleEntry[] = [{ key: ROOT_KEY, path: ':', dir: '' }],
): string {
  mkdirSync(rootReports(root), { recursive: true });
  writeFileSync(path.join(reportBaseOf(root), 'modules.json'), JSON.stringify(modules));
  return rootReports(root);
}

export function readingFrom<Result>(
  readFindings: (root: string, options: ReadOptions) => Result,
): (root: string, options?: ReadOptions) => Result {
  return (root, options) => readFindings(root, { reportBase: reportBaseOf(root), ...options });
}
