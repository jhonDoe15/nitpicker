import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { coverageForMethods } from './istanbul/attribution.mjs';
import {
  CoverageReportParseError,
  normalizePathForMatch,
  parseCoverageReport,
} from './istanbul/istanbul-report.mjs';
import { crapScore } from './istanbul/metrics.mjs';
import { describeFunctions } from './functions/describe.mjs';
import { selectSourceFiles } from './source-files.mjs';

function loadCoverage(coverageReportPath, projectRoot) {
  if (!existsSync(coverageReportPath)) {
    return {
      byFile: new Map(),
      unknownReason: 'missing_report',
      warning: `Warning: Coverage report not found at ${coverageReportPath}. Coverage will be N/A.`,
    };
  }
  try {
    return { byFile: parseCoverageReport(coverageReportPath, projectRoot), unknownReason: null };
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

function suffixMatches(byFile, relativePath) {
  const suffix = `/${relativePath.toLowerCase()}`;
  return [...byFile].filter(([candidate]) => candidate.endsWith(suffix)).map(([, entry]) => entry);
}

function fileCoverageOf(coverage, file, relativePath) {
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
      warning: `Warning: Coverage for ${relativePath} matched ${matches.length} report entries by suffix. Coverage will be N/A.`,
    };
  }
  return { unknownReason: coverage.unknownReason ?? 'file_unmatched' };
}

function methodCoverages(descriptors, fileCoverage) {
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
        { ...fileCoverage.entry, functions: [] },
        fileCoverage.unknownReason,
      )
    : withFunctionMap;
}

function parseSource(file) {
  const kind = file.toLowerCase().endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const messages = diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    );
    throw new SyntaxError(`Unable to parse TypeScript source ${file}: ${messages.join('; ')}`);
  }
  return sourceFile;
}

function metricOf(descriptor, coverage, relativePath) {
  return {
    ...descriptor,
    relativePath,
    location: `${relativePath}:${descriptor.startLine}-${descriptor.endLine}`,
    coverage: coverage.coverage,
    statementCoverage: coverage.statementCoverage,
    branchCoverage: coverage.branchCoverage,
    crapScore: crapScore(descriptor.complexity, coverage.coverage.percent),
  };
}

function measureFile(file, projectRoot, coverage) {
  const relativePath = path.relative(projectRoot, file).replaceAll('\\', '/');
  let descriptors;
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
    metrics: descriptors.map((descriptor, index) =>
      metricOf(descriptor, coverages[index], relativePath),
    ),
    warnings: fileCoverage.warning ? [fileCoverage.warning] : [],
  };
}

export function measureCrap(projectRoot, files, options) {
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
