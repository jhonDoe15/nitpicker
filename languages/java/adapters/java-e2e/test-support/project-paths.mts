import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { JavaFinding } from '../../typed/java-values.mts';

function isProjectPath(projectRoot: string, { path: file, location }: JavaFinding): boolean {
  if (file === '.') {
    return location === undefined;
  }
  const root = path.resolve(projectRoot);
  const absolute = path.resolve(root, file);
  if (file.split('/').includes('..') || !absolute.startsWith(root + path.sep)) {
    return false;
  }
  return existsSync(absolute) && (location === undefined || statSync(absolute).isFile());
}

export function pathsOutsideProject(root: string, findings: readonly JavaFinding[]): string[] {
  return [
    ...new Set(
      findings
        .filter((finding) => !isProjectPath(root, finding))
        .map(({ tool, rule, path: file }) => `${tool}/${rule} ${file}`),
    ),
  ].sort();
}

export function pathsOf(findings: readonly JavaFinding[], tool: string): string[] {
  return [
    ...new Set(findings.filter((finding) => finding.tool === tool).map(({ path: file }) => file)),
  ].sort();
}
