import { MINIMUM_BRANCH_COVERAGE } from '../../../../shared/policy.mjs';
import { branchCoverageFindings } from '../../../../shared/rules/branch-coverage.mjs';
import { enclosingFunctionName } from '../../../../shared/rules/finding-helpers.mjs';
import { hashIdentity, normalizeReportPath } from '../../../../shared/ingest/common.mjs';
import { type XmlElement, childrenNamed, parseXml } from '../../../../shared/values/xml.mts';
import { listOf, textOf } from '../../../../shared/values/readers.mts';
import { formatAgnosticText } from '../../../../shared/source-text/format-tokens.mjs';
import {
  isCompilerGeneratedBranchLine,
  libraryBranchCount,
  libraryCalls,
  suspensionCall,
} from './kotlin-branches.mjs';

type BranchOptions = {
  readonly tool?: string;
  readonly minimum?: number;
  readonly sourceRoot?: unknown;
  readonly functions?: readonly unknown[];
  readonly units?: (file: string, text: string) => unknown;
  readonly locate?: (packageName: string, fileName: string) => unknown;
  readonly sourceText?: (file: string) => unknown;
};
type BranchRun = {
  readonly options: BranchOptions;
  readonly tool: string;
  readonly minimum: number;
};
type SourceLines = { readonly path: string; readonly lines: readonly string[] };
type FileRun = { readonly tool: string; readonly minimum: number; readonly functions: unknown[] };
type LineBranch = {
  readonly path: string;
  readonly key: unknown;
  readonly percent: number;
  readonly line: number;
  readonly arms?: string[];
};

const INLINED_HINT =
  ', which is inlined from the standard library (pass null to take its null arm)';

export function ingestJacocoBranches(
  xml: string,
  options: BranchOptions = {},
): { findings: unknown[] } {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  const tool = options.tool ?? 'jacoco';
  const minimum = options.minimum ?? MINIMUM_BRANCH_COVERAGE;
  const findings: unknown[] = [];
  for (const pkg of childrenNamed(report, 'package')) {
    for (const sourcefile of childrenNamed(pkg, 'sourcefile')) {
      findings.push(...sourcefileFindings(sourcefile, pkg, { options, tool, minimum }));
    }
  }
  return { findings };
}

function sourcefileFindings(
  sourcefile: XmlElement,
  pkg: XmlElement,
  { options, tool, minimum }: BranchRun,
): readonly unknown[] {
  const filePath = locateSource(pkg.attrs['name'] ?? '', sourcefile.attrs['name'] ?? '', options);
  const text: unknown = filePath === undefined ? undefined : options.sourceText?.(filePath);
  if (filePath === undefined || typeof text !== 'string') {
    return unresolvedKotlinFinding(sourcefile, pkg, tool);
  }
  return fileFindings(
    sourcefile,
    { path: filePath, lines: text.split(/\r?\n/u) },
    {
      tool,
      minimum,
      functions: [...(options.functions ?? []), ...listOf(options.units?.(filePath, text) ?? [])],
    },
  );
}

function locateSource(
  packageName: string,
  fileName: string,
  options: BranchOptions,
): string | undefined {
  const located: unknown =
    options.locate === undefined
      ? normalizeReportPath(
          [textOf(options.sourceRoot ?? ''), packageName, fileName]
            .filter((part) => part !== '')
            .join('/'),
        )
      : options.locate(packageName, fileName);
  return typeof located === 'string' ? located : undefined;
}

function unresolvedKotlinFinding(sourcefile: XmlElement, pkg: XmlElement, tool: string): unknown[] {
  const name = sourcefile.attrs['name'] ?? '';
  const packageName = pkg.attrs['name'] ?? '';
  const missed = childrenNamed(sourcefile, 'line').reduce(
    (sum, line) => sum + (Number.parseInt(line.attrs['mb'] ?? '', 10) || 0),
    0,
  );
  if (!name.endsWith('.kt') || missed === 0 || /^kotlinx?(\/|$)/u.test(packageName)) {
    return [];
  }
  const normalized: unknown = normalizeReportPath(`${packageName}/${name}`);
  return [
    {
      tool,
      rule: 'branch-source-not-found',
      path: normalized ?? name,
      identity: 'branch-source-not-found',
      message: `Source file not found, so its ${String(missed)} missed branches are not checked. Put it under a Kotlin source root and declare its package`,
      classification: 'descriptive',
    },
  ];
}

function fileFindings(sourcefile: XmlElement, file: SourceLines, run: FileRun): readonly unknown[] {
  const branches = childrenNamed(sourcefile, 'line')
    .map((line) => lineBranch(line, file))
    .filter((branch) => branch !== undefined)
    .map((branch) => ({
      ...branch,
      symbol: enclosingFunctionName(run.functions, branch.path, branch.line),
    }));
  return listOf(
    branchCoverageFindings(branches, {
      tool: run.tool,
      minimum: run.minimum,
      identify: (key: unknown, occurrence: number) =>
        occurrence === 1 ? key : `${textOf(key)}#${String(occurrence)}`,
    }),
  );
}

function lineBranch(
  line: XmlElement,
  { path: filePath, lines: sourceLines }: SourceLines,
): LineBranch | undefined {
  const missed = Number.parseInt(line.attrs['mb'] ?? '', 10);
  const covered = Number.parseInt(line.attrs['cb'] ?? '', 10);
  const lineNumber = Number.parseInt(line.attrs['nr'] ?? '', 10);
  const total = missed + covered;
  const source = sourceLines[lineNumber - 1]?.trim().replaceAll(/\s+/gu, ' ') ?? '';
  if (!(total > 0) || !Number.isInteger(lineNumber) || source === '') {
    return undefined;
  }
  const kotlin = filePath.endsWith('.kt');
  if (kotlin && (isCompilerGeneratedBranchLine(source) || libraryBranchCount(source) === total)) {
    return undefined;
  }
  const arm = kotlin ? generatedArm(source) : undefined;
  return {
    path: filePath,
    key: hashIdentity('branch-source', [formatAgnosticText(sourceLines[lineNumber - 1], filePath)]),
    percent: (covered / total) * 100,
    line: lineNumber,
    ...(arm === undefined ? {} : { arms: [arm] }),
  };
}

function generatedArm(source: string): string | undefined {
  const suspension: unknown = suspensionCall(source);
  if (suspension !== undefined) {
    return `${textOf(suspension)} suspending (move the call to its own line if no branch of yours is untested)`;
  }
  const [library] = listOf(libraryCalls(source));
  return library === undefined
    ? undefined
    : `a branch of this line or of ${textOf(library)}${INLINED_HINT}`;
}
