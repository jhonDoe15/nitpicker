import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { ingestSarif } from '../../ingest/sarif.mjs';
import { readKotlinDuplicateFindings } from '../kotlin/kotlin-duplicates.mjs';
import {
  readKotlinCrapFindings,
  readKotlinMetrics,
  readKotlinStructureFindings,
} from '../kotlin/kotlin-metrics.mjs';
import { addOneWayHint } from '../kotlin/rules/kotlin-rules.mjs';
import { readSuppressionFindings } from '../kotlin/rules/kotlin-suppressions.mjs';

const DETEKT_TOOL = 'detekt';
const DETEKT_REPORT = 'detekt.sarif';
const KTLINT_REPORT = 'ktlint.sarif';
const KTFMT_REPORT = 'ktfmt.txt';
const KTLINT_PREFIX = 'ktlint.';
const PACKAGE_DECLARATION = /^\s*package\s+([\w.`]+)/m;

export function requireKotlinManifest(manifest) {
  if (manifest.kotlin !== true) {
    throw new Error(
      'The kotlin preset needs a Gradle project that applies org.jetbrains.kotlin.jvm; this one does not',
    );
  }
}

export function kotlinLintedRoots({ kotlinSourceRoots, kotlinTestSourceRoots = [] }) {
  return [...new Set([...kotlinSourceRoots, ...kotlinTestSourceRoots])];
}

export function jacocoSourceRoots({ sourceRoots, manifest, kotlin }) {
  return kotlin ? [...new Set([...sourceRoots, ...manifest.kotlinSourceRoots])] : sourceRoots;
}

export function sourceLocator(projectRoot, sourceRoots) {
  let kotlinFiles;
  return (packageDirectory, fileName) => {
    const direct = sourceRoots
      .map((sourceRoot) => [sourceRoot, packageDirectory, fileName].filter(Boolean).join('/'))
      .find((candidate) => existsSync(path.join(projectRoot, candidate)));
    if (direct !== undefined || !fileName.endsWith('.kt')) {
      return direct;
    }
    kotlinFiles ??= declaredKotlinFiles(projectRoot, sourceRoots);
    const packageName = packageDirectory.replaceAll('/', '.');
    return kotlinFiles.find(
      (file) => file.packageName === packageName && file.path.endsWith(`/${fileName}`),
    )?.path;
  };
}

function declaredKotlinFiles(projectRoot, sourceRoots) {
  return sourceRoots.flatMap((sourceRoot) => {
    const directory = path.join(projectRoot, sourceRoot);
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory, { recursive: true })
      .filter((entry) => entry.endsWith('.kt'))
      .map((entry) => {
        const relative = `${sourceRoot}/${entry.replaceAll('\\', '/')}`;
        return { path: relative, packageName: declaredPackage(path.join(projectRoot, relative)) };
      });
  });
}

function declaredPackage(file) {
  return PACKAGE_DECLARATION.exec(readFileSync(file, 'utf8'))?.[1].replaceAll('`', '') ?? '';
}

export function reportOnlyKotlinMutants(findings) {
  return findings.map((finding) =>
    finding.rule.startsWith('mutant-') && finding.path.endsWith('.kt')
      ? { ...finding, classification: 'descriptive' }
      : finding,
  );
}

export function readKotlinFindings(context, crapLimit) {
  const { reportRoot, manifest, projectRoot, jacoco } = context;
  const metrics = readKotlinMetrics(reportRoot);
  return [
    ...detektFindings(reportRoot),
    ...readSuppressionFindings(projectRoot, kotlinLintedRoots(manifest)),
    ...formatterFindings(reportRoot, manifest.kotlinFormatter),
    ...readKotlinStructureFindings(metrics, projectRoot),
    ...readKotlinCrapFindings(metrics, {
      projectRoot,
      jacoco,
      crapLimit,
    }),
    ...readKotlinDuplicateFindings(reportRoot),
  ];
}

function subjectOf(text) {
  return text.replaceAll(/\b\d+\b/g, '#');
}

function identifiedBySubject(log) {
  return {
    ...log,
    runs: log.runs.map((run) => ({
      ...run,
      results: run.results.map((result) => ({
        ...result,
        partialFingerprints: { 'nitpicker/subject': subjectOf(result.message.text) },
      })),
    })),
  };
}

function readSarif(reportRoot, file) {
  return identifiedBySubject(JSON.parse(readFileSync(path.join(reportRoot, file), 'utf8')));
}

function detektFindings(reportRoot) {
  return ingestSarif(readSarif(reportRoot, DETEKT_REPORT), { tool: DETEKT_TOOL }).findings.map(
    addOneWayHint,
  );
}

function ktlintSwitch(ruleId) {
  return `ktlint_${ruleId.replace(':', '_')}`;
}

function ktlintFindings(reportRoot) {
  return ingestSarif(readSarif(reportRoot, KTLINT_REPORT), { tool: 'ktlint' }).findings.map(
    (finding) => ({
      ...finding,
      rule: `${KTLINT_PREFIX}${finding.rule}`,
      message: `${finding.message}. Lift this rule: ${ktlintSwitch(finding.rule)} = disabled in .editorconfig. Not your formatter: set kotlin.formatter`,
    }),
  );
}

function ktfmtFindings(reportRoot) {
  return ingestFormatCheck(readFileSync(path.join(reportRoot, KTFMT_REPORT), 'utf8'), {
    tool: 'ktfmt',
    message: 'File is not formatted with ktfmt. Not your formatter: set kotlin.formatter',
  }).findings;
}

function formatterFindings(reportRoot, formatter) {
  if (formatter === 'ktlint') {
    return ktlintFindings(reportRoot);
  }
  return formatter === 'ktfmt' ? ktfmtFindings(reportRoot) : [];
}
