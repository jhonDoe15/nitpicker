import {
  childrenNamed,
  coverageMetricFinding,
  normalizeReportPath,
  parseXml,
  uncoveredFinding,
} from './common.mjs';

// JaCoCo XML -> descriptive findings per source file: a `line-coverage` metric (from the
// sourcefile LINE counter) and one `uncovered-method` finding per method whose lines are all
// missed (identity from class and method name+descriptor, never the line).
// `options.sourceRoot` (e.g. "src/main/java") is prepended to the package-relative path.

export function ingestJacoco(xml, options = {}) {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  const tool = options.tool ?? 'jacoco';
  const findings = [];
  for (const pkg of childrenNamed(report, 'package')) {
    const packageName = pkg.attrs.name ?? '';
    const pathFor = (fileName) =>
      normalizeReportPath(
        [options.sourceRoot, packageName, fileName].filter((part) => part).join('/'),
      );

    for (const sourcefile of childrenNamed(pkg, 'sourcefile')) {
      const filePath = pathFor(sourcefile.attrs.name ?? '');
      const counter = lineCounter(sourcefile);
      if (filePath !== undefined && counter !== undefined) {
        findings.push(
          coverageMetricFinding({ tool, path: filePath, name: 'line-coverage', ...counter }),
        );
      }
    }
    for (const cls of childrenNamed(pkg, 'class')) {
      const filePath = pathFor(cls.attrs.sourcefilename ?? '');
      if (filePath === undefined) {
        continue;
      }
      for (const method of childrenNamed(cls, 'method')) {
        const counter = lineCounter(method);
        if (counter !== undefined && counter.covered === 0) {
          const symbol = `${(cls.attrs.name ?? '').replaceAll('/', '.')}#${method.attrs.name ?? ''}${method.attrs.desc ?? ''}`;
          findings.push(
            uncoveredFinding({
              tool,
              rule: 'uncovered-method',
              path: filePath,
              symbol,
              message: `Method ${symbol} is not covered`,
            }),
          );
        }
      }
    }
  }
  return { findings };
}

function lineCounter(element) {
  const counter = childrenNamed(element, 'counter').find(
    (candidate) => candidate.attrs.type === 'LINE',
  );
  if (counter === undefined) {
    return undefined;
  }
  const missed = Number.parseInt(counter.attrs.missed, 10);
  const covered = Number.parseInt(counter.attrs.covered, 10);
  const total = missed + covered;
  return total > 0 ? { covered, total } : undefined;
}
