import { realpathSync } from 'node:fs';
import path from 'node:path';

const MILLISECONDS = 1000;

export function runKey({ file, name }) {
  return `${file}\0${name}`;
}

function projectRoots(projectRoot) {
  try {
    return [...new Set([projectRoot, realpathSync(projectRoot)])];
  } catch {
    return [projectRoot];
  }
}

export function projectFile(projectRoot, name) {
  const relatives = projectRoots(projectRoot).map((root) =>
    path.relative(root, String(name)).replaceAll('\\', '/'),
  );
  return relatives.find((relative) => !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function passedRuns(report, projectRoot) {
  const results = Array.isArray(report?.testResults) ? report.testResults : [];
  return results.flatMap((result) =>
    (result?.assertionResults ?? [])
      .filter((run) => run?.status === 'passed' && Number.isFinite(run.duration))
      .map((run) => ({
        file: projectFile(projectRoot, result.name),
        name: run.fullName ?? run.title,
        seconds: run.duration / MILLISECONDS,
      }))
      .filter((run) => run.file !== undefined),
  );
}
