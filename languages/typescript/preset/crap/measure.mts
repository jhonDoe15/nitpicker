import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import { coverageForMethods } from './istanbul/attribution.mts';
import {
  CoverageReportParseError,
  normalizePathForMatch,
  parseCoverageReport,
} from './istanbul/istanbul-report.mts';
import { crapScore } from './istanbul/metrics.mts';
import { describeFunctions } from './functions/describe.mts';
import { selectSourceFiles, type SourceExclusionAudit } from './source-files.mts';
import { blockingParseDiagnostics } from '../syntax/diagnostics/legacy-scripts.mts';
import type {
  FileCoverage,
  FunctionDescriptor,
  FunctionMetric,
  MethodCoverage,
} from './crap-types.mts';

const ts = typescriptApi();

type LoadedCoverage = {
  readonly byFile: ReadonlyMap<string, FileCoverage>;
  readonly unknownReason: string | undefined;
  readonly warning?: string;
};

type FileLookup = {
  readonly entry?: FileCoverage | undefined;
  readonly unknownReason?: string | undefined;
  readonly warning?: string;
};

function loadCoverage(coverageReportPath: string, projectRoot: string): LoadedCoverage {
  if (!existsSync(coverageReportPath)) {
    return {
      byFile: new Map(),
      unknownReason: 'missing_report',
      warning: `Warning: Coverage report not found at ${coverageReportPath}. Coverage will be N/A.`,
    };
  }
  try {
    return {
      byFile: parseCoverageReport(coverageReportPath, projectRoot),
      unknownReason: undefined,
    };
  } catch (error) {
    if (!(error instanceof CoverageReportParseError)) {
      throw error;
    }
    return {
      byFile: new Map(),
      unknownReason: 'unparseable_report',
      warning: `Warning: ${error.message}. Coverage will be N/A.`,
    };
  }
}

function suffixMatches(
  byFile: ReadonlyMap<string, FileCoverage>,
  relativePath: string,
): FileCoverage[] {
  const suffix = `/${relativePath.toLowerCase()}`;
  return [...byFile].filter(([candidate]) => candidate.endsWith(suffix)).map(([, entry]) => entry);
}

function fileCoverageOf(coverage: LoadedCoverage, file: string, relativePath: string): FileLookup {
  const exact = coverage.byFile.get(normalizePathForMatch(file));
  if (exact) {
    return { entry: exact };
  }
  const matches = suffixMatches(coverage.byFile, relativePath);
  if (matches.length === 1) {
    return { entry: matches[0] };
  }
  if (matches.length > 1) {
    return {
      unknownReason: 'file_ambiguous',
      warning: `Warning: Coverage for ${relativePath} matched ${String(matches.length)} report entries by suffix. Coverage will be N/A.`,
    };
  }
  return { unknownReason: coverage.unknownReason ?? 'file_unmatched' };
}

function methodCoverages(
  descriptors: readonly FunctionDescriptor[],
  fileCoverage: FileLookup,
): MethodCoverage[] {
  const withFunctionMap = coverageForMethods(
    descriptors,
    fileCoverage.entry,
    fileCoverage.unknownReason,
  );
  const conflicted = withFunctionMap.some(
    ({ coverage }) => coverage.unknownReason === 'fnmap_conflict',
  );
  return conflicted
    ? coverageForMethods(
        descriptors,
        fileCoverage.entry && { ...fileCoverage.entry, functions: [] },
        fileCoverage.unknownReason,
      )
    : withFunctionMap;
}

function formatDiagnostic(
  sourceFile: TypeScript.SourceFile,
  diagnostic: TypeScript.Diagnostic,
): string {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  if (diagnostic.start === undefined) {
    return `unknown location: ${text}`;
  }
  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
  return `line ${String(position.line + 1)}, column ${String(position.character + 1)}: ${text}`;
}

type ParsedSourceFile = TypeScript.SourceFile & {
  readonly parseDiagnostics: readonly TypeScript.Diagnostic[];
};

function hasParseDiagnostics(sourceFile: TypeScript.SourceFile): sourceFile is ParsedSourceFile {
  return 'parseDiagnostics' in sourceFile;
}

function parseSource(file: string): TypeScript.SourceFile {
  const kind = file.toLowerCase().endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const diagnostics = blockingParseDiagnostics(
    file,
    hasParseDiagnostics(sourceFile) ? sourceFile.parseDiagnostics : [],
  );
  if (diagnostics.length > 0) {
    const messages = diagnostics.map((diagnostic) => formatDiagnostic(sourceFile, diagnostic));
    throw new SyntaxError(`Unable to parse TypeScript source ${file}: ${messages.join('; ')}`);
  }
  return sourceFile;
}

function metricOf(
  descriptor: FunctionDescriptor,
  coverage: MethodCoverage,
  relativePath: string,
): FunctionMetric {
  return {
    ...descriptor,
    relativePath,
    location: `${relativePath}:${String(descriptor.startLine)}-${String(descriptor.endLine)}`,
    coverage: coverage.coverage,
    statementCoverage: coverage.statementCoverage,
    branchCoverage: coverage.branchCoverage,
    crapScore: crapScore(descriptor.complexity, coverage.coverage.percent),
  };
}

function measureFile(
  file: string,
  projectRoot: string,
  coverage: LoadedCoverage,
): { readonly metrics: FunctionMetric[]; readonly warnings: string[] } {
  const relativePath = path.relative(projectRoot, file).replaceAll('\\', '/');
  let descriptors: FunctionDescriptor[];
  try {
    descriptors = describeFunctions(parseSource(file));
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    return {
      metrics: [],
      warnings: [`Warning: Could not parse ${relativePath}: ${error.message}. Skipping file.`],
    };
  }
  const fileCoverage = fileCoverageOf(coverage, file, relativePath);
  const coverages = methodCoverages(descriptors, fileCoverage);
  return {
    metrics: descriptors.flatMap((descriptor, index) => {
      const methodCoverage = coverages[index];
      return methodCoverage ? [metricOf(descriptor, methodCoverage, relativePath)] : [];
    }),
    warnings: fileCoverage.warning ? [fileCoverage.warning] : [],
  };
}

export function measureCrap(
  projectRoot: string,
  files: readonly string[],
  options: {
    readonly extensions: readonly string[];
    readonly excludes: readonly string[];
    readonly coverageReportPath: string;
  },
): {
  readonly metrics: FunctionMetric[];
  readonly selectedFiles: string[];
  readonly warnings: string[];
  readonly sourceExclusionAudit: SourceExclusionAudit;
} {
  const { files: selectedFiles, audit } = selectSourceFiles(projectRoot, files, options);
  const coverage = loadCoverage(options.coverageReportPath, projectRoot);
  const measured = selectedFiles.map((file) => measureFile(file, projectRoot, coverage));
  return {
    metrics: measured.flatMap(({ metrics }) => metrics),
    selectedFiles,
    warnings: [
      ...(selectedFiles.length > 0 && coverage.warning ? [coverage.warning] : []),
      ...measured.flatMap(({ warnings }) => warnings),
    ],
    sourceExclusionAudit: audit,
  };
}
