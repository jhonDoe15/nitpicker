import {
  coverageMetricFinding,
  normalizeReportPath,
  uncoveredFinding,
} from '../../../../shared/ingest/common.mjs';
import { type XmlElement, childrenNamed, parseXml } from '../../../../shared/values/xml.mts';

type JacocoOptions = { readonly tool?: string | undefined; readonly sourceRoot?: unknown };
type PathFor = (fileName: string) => string | undefined;
type LineCounter = { readonly covered: number; readonly total: number };
type UncoveredMethod = {
  readonly cls: XmlElement;
  readonly method: XmlElement;
  readonly filePath: string;
  readonly tool: string;
};

export function ingestJacoco(xml: string, options: JacocoOptions = {}): { findings: unknown[] } {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  const tool = options.tool ?? 'jacoco';
  const findings = childrenNamed(report, 'package').flatMap((pkg) =>
    packageFindings(pkg, options.sourceRoot, tool),
  );
  return { findings };
}

function packageFindings(pkg: XmlElement, sourceRoot: unknown, tool: string): unknown[] {
  const packageName = pkg.attrs['name'] ?? '';
  function pathFor(fileName: string): string | undefined {
    const parts: unknown[] = [sourceRoot, packageName, fileName];
    const joined = parts.filter((part) => part !== undefined && part !== '').join('/');
    const normalized: unknown = normalizeReportPath(joined);
    return typeof normalized === 'string' ? normalized : undefined;
  }
  return [
    ...childrenNamed(pkg, 'sourcefile').flatMap((sourcefile) =>
      sourcefileFindings(sourcefile, pathFor, tool),
    ),
    ...childrenNamed(pkg, 'class').flatMap((cls) => classFindings(cls, pathFor, tool)),
  ];
}

function sourcefileFindings(sourcefile: XmlElement, pathFor: PathFor, tool: string): unknown[] {
  const filePath = pathFor(sourcefile.attrs['name'] ?? '');
  const counter = lineCounter(sourcefile);
  if (filePath === undefined || counter === undefined) {
    return [];
  }
  return [coverageMetricFinding({ tool, path: filePath, name: 'line-coverage', ...counter })];
}

function classFindings(cls: XmlElement, pathFor: PathFor, tool: string): unknown[] {
  const filePath = pathFor(cls.attrs['sourcefilename'] ?? '');
  if (filePath === undefined) {
    return [];
  }
  return childrenNamed(cls, 'method')
    .filter((method) => isUncoveredMethod(method))
    .map((method) => uncoveredMethodFinding({ cls, method, filePath, tool }));
}

function isUncoveredMethod(method: XmlElement): boolean {
  const counter = lineCounter(method);
  return counter !== undefined && counter.covered === 0;
}

function uncoveredMethodFinding({ cls, method, filePath, tool }: UncoveredMethod): unknown {
  const className = (cls.attrs['name'] ?? '').replaceAll('/', '.');
  const symbol = `${className}#${method.attrs['name'] ?? ''}${method.attrs['desc'] ?? ''}`;
  return uncoveredFinding({
    tool,
    rule: 'uncovered-method',
    path: filePath,
    symbol,
    message: `Method ${symbol} is not covered`,
  });
}

function lineCounter(element: XmlElement): LineCounter | undefined {
  const counter = childrenNamed(element, 'counter').find(
    (candidate) => candidate.attrs['type'] === 'LINE',
  );
  if (counter === undefined) {
    return undefined;
  }
  const missed = Number.parseInt(counter.attrs['missed'] ?? '', 10);
  const covered = Number.parseInt(counter.attrs['covered'] ?? '', 10);
  const total = missed + covered;
  return total > 0 ? { covered, total } : undefined;
}
