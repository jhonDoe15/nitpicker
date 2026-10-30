import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

function isProjectPath(projectRoot, { path: file, location }) {
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

export function pathsOutsideProject(root, findings) {
  return [
    ...new Set(
      findings
        .filter((finding) => !isProjectPath(root, finding))
        .map(({ tool, rule, path: file }) => `${tool}/${rule} ${file}`),
    ),
  ].sort();
}

export function pathsOf(findings, tool) {
  return [
    ...new Set(findings.filter((finding) => finding.tool === tool).map(({ path: file }) => file)),
  ].sort();
}
