import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { ingestSarif } from '../../ingest/sarif.mjs';
import { kotlinFormatAdvice } from '../kotlin/style/kotlin-format-advice.mjs';
import {
  readKotlinCrapFindings,
  readKotlinMetrics,
  readKotlinStructureFindings,
} from '../kotlin/kotlin-metrics.mjs';
import { addOneWayHint, appendSentence } from '../kotlin/rules/kotlin-rules.mjs';
import {
  readCatchLogFindings,
  readTestAssertionFindings,
} from '../kotlin/rules/kotlin-source-rules.mjs';
import { readSuppressionFindings } from '../kotlin/rules/kotlin-suppressions.mjs';

const DETEKT_TOOL = 'detekt';
const DETEKT_REPORT = 'detekt.sarif';
const KTLINT_REPORT = 'ktlint.sarif';
const KTFMT_REPORT = 'ktfmt.txt';
const KTLINT_PREFIX = 'ktlint.';
const DEFAULT_ADVICE = kotlinFormatAdvice({ ktfmtStyle: 'meta' }, {});
const NOT_YOUR_FORMATTER = 'Not your formatter: set kotlin.formatter';
const PACKAGE_DECLARATION = /^\s*package\s+([\w.`]+)/m;

export function requireKotlinManifest(manifest) {
  if (manifest.kotlin !== true) {
    throw new Error(
      'The kotlin preset needs a Gradle project that applies org.jetbrains.kotlin.jvm; this one does not',
    );
  }
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
  const { reportRoot, manifest, projectRoot, jacoco, formatAdvice = DEFAULT_ADVICE } = context;
  const metrics = readKotlinMetrics(reportRoot);
  const testRoots = manifest.kotlinTestSourceRoots ?? [];
  const helpers = (context.conventions?.['kotlin.assertionHelpers'] ?? '')
    .split(',')
    .filter(Boolean);
  return [
    ...detektFindings(reportRoot, formatAdvice),
    ...readSuppressionFindings(projectRoot, manifest.kotlinSourceRoots),
    ...readCatchLogFindings(projectRoot, [...manifest.kotlinSourceRoots, ...testRoots]),
    ...readTestAssertionFindings(projectRoot, testRoots, helpers),
    ...formatterFindings(reportRoot, manifest.kotlinFormatter, formatAdvice),
    ...readKotlinStructureFindings(metrics, projectRoot),
    ...readKotlinCrapFindings(metrics, {
      projectRoot,
      jacoco,
      crapLimit,
    }),
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

function withProjectConfigRoute(finding, advice) {
  const hinted = addOneWayHint(finding);
  return hinted !== finding || advice.detekt === undefined
    ? hinted
    : { ...finding, message: appendSentence(finding.message, advice.detekt) };
}

function detektFindings(reportRoot, advice) {
  return ingestSarif(readSarif(reportRoot, DETEKT_REPORT), { tool: DETEKT_TOOL }).findings.map(
    (finding) => withProjectConfigRoute(finding, advice),
  );
}

function ktlintSwitch(ruleId) {
  return `ktlint_${ruleId.replace(':', '_')}`;
}

function ktlintFindings(reportRoot, advice) {
  return ingestSarif(readSarif(reportRoot, KTLINT_REPORT), { tool: 'ktlint' }).findings.map(
    (finding) => ({
      ...finding,
      rule: `${KTLINT_PREFIX}${finding.rule}`,
      message: `${finding.message}. ${advice.ktlint(ktlintSwitch(finding.rule))} ${NOT_YOUR_FORMATTER}`,
    }),
  );
}

function ktfmtFindings(reportRoot, advice) {
  return ingestFormatCheck(readFileSync(path.join(reportRoot, KTFMT_REPORT), 'utf8'), {
    tool: 'ktfmt',
    message: `File is not formatted with ktfmt. ${advice.ktfmt} ${NOT_YOUR_FORMATTER}`,
  }).findings;
}

function formatterFindings(reportRoot, formatter, advice) {
  if (formatter === 'ktlint') {
    return ktlintFindings(reportRoot, advice);
  }
  return formatter === 'ktfmt' ? ktfmtFindings(reportRoot, advice) : [];
}
