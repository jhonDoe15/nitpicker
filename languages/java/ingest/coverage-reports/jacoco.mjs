import {
  childrenNamed,
  coverageMetricFinding,
  normalizeReportPath,
  parseXml,
  uncoveredFinding,
} from '../../../../shared/ingest/common.mjs';

export function ingestJacoco(xml, options = {}) {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  const tool = options.tool ?? 'jacoco';
  const context = { tool, sourceRoot: options.sourceRoot };
  const findings = childrenNamed(report, 'package').flatMap((pkg) => packageFindings(pkg, context));
  return { findings };
}

function packageFindings(pkg, context) {
  const packageName = pkg.attrs.name ?? '';
  function pathFor(fileName) {
    return normalizeReportPath(
      [context.sourceRoot, packageName, fileName].filter((part) => part).join('/'),
    );
  }
  return [
    ...childrenNamed(pkg, 'sourcefile').flatMap((sourcefile) =>
      sourcefileFindings(sourcefile, pathFor, context.tool),
    ),
    ...childrenNamed(pkg, 'class').flatMap((cls) => classFindings(cls, pathFor, context.tool)),
  ];
}

function sourcefileFindings(sourcefile, pathFor, tool) {
  const filePath = pathFor(sourcefile.attrs.name ?? '');
  const counter = lineCounter(sourcefile);
  if (filePath === undefined || counter === undefined) {
    return [];
  }
  return [coverageMetricFinding({ tool, path: filePath, name: 'line-coverage', ...counter })];
}

function classFindings(cls, pathFor, tool) {
  const filePath = pathFor(cls.attrs.sourcefilename ?? '');
  if (filePath === undefined) {
    return [];
  }
  return childrenNamed(cls, 'method')
    .filter(isUncoveredMethod)
    .map((method) => uncoveredMethodFinding({ cls, method, filePath, tool }));
}

function isUncoveredMethod(method) {
  const counter = lineCounter(method);
  return counter !== undefined && counter.covered === 0;
}

function uncoveredMethodFinding({ cls, method, filePath, tool }) {
  const className = (cls.attrs.name ?? '').replaceAll('/', '.');
  const symbol = `${className}#${method.attrs.name ?? ''}${method.attrs.desc ?? ''}`;
  return uncoveredFinding({
    tool,
    rule: 'uncovered-method',
    path: filePath,
    symbol,
    message: `Method ${symbol} is not covered`,
  });
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
