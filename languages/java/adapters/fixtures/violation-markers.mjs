import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const VIOLATION_MARKER = /\/\/ violation: (.*)$/;

function javaFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(root, name));
}

function relativeTo(sourceRoot, file) {
  return path.relative(sourceRoot, file).split(path.sep).join('/');
}

export function expectedViolations(sourceRoot) {
  return javaFiles(sourceRoot)
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const marker = VIOLATION_MARKER.exec(line);
          return marker === null
            ? []
            : marker[1]
                .split(',')
                .map(
                  (rule) => `${relativeTo(sourceRoot, file)}:${String(index + 1)} ${rule.trim()}`,
                );
        }),
    )
    .sort();
}

export function reportedViolations(sarifFile, sourceRoot, isCheckedRule) {
  const [run] = JSON.parse(readFileSync(sarifFile, 'utf8')).runs;
  return run.results
    .filter((result) => isCheckedRule(result.ruleId))
    .map((result) => {
      const { artifactLocation, region } = result.locations[0].physicalLocation;
      const file = new URL(artifactLocation.uri).pathname;
      return `${relativeTo(sourceRoot, file)}:${String(region.startLine)} ${result.ruleId}`;
    })
    .filter((violation) => !violation.startsWith('..'))
    .sort();
}
