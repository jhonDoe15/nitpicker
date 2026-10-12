import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck } from '../ingest/format-check.mjs';
import { ingestSarif } from '../ingest/sarif.mjs';
import { readKotlinDuplicateFindings } from './kotlin-duplicates.mjs';
import {
  readKotlinCrapFindings,
  readKotlinMetrics,
  readKotlinStructureFindings,
} from './kotlin-metrics.mjs';

const DETEKT_TOOL = 'detekt';
const DETEKT_REPORT = 'detekt.sarif';
const KTLINT_REPORT = 'ktlint.sarif';
const KTFMT_REPORT = 'ktfmt.txt';
const KTLINT_PREFIX = 'ktlint.';

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

export function readKotlinFindings(context, crapLimit) {
  const { reportRoot, manifest, projectRoot, jacoco } = context;
  const metrics = readKotlinMetrics(reportRoot);
  return [
    ...detektFindings(reportRoot),
    ...formatterFindings(reportRoot, manifest.kotlinFormatter),
    ...readKotlinStructureFindings(metrics, projectRoot),
    ...readKotlinCrapFindings(metrics, {
      projectRoot,
      jacoco,
      sourceRoots: jacocoSourceRoots(context),
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
  return ingestSarif(readSarif(reportRoot, DETEKT_REPORT), { tool: DETEKT_TOOL }).findings;
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
