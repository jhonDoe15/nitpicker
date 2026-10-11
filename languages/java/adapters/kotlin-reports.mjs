import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck } from '../ingest/format-check.mjs';
import { ingestSarif } from '../ingest/sarif.mjs';

export const DETEKT_TOOL = 'detekt';
const DETEKT_REPORT = 'detekt.sarif';
const FORMAT_REPORT = 'kotlin-format.txt';

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

export function readKotlinFindings({ reportRoot, manifest }) {
  return [...detektFindings(reportRoot), ...formatFindings(reportRoot, manifest.kotlinFormatter)];
}

function detektFindings(reportRoot) {
  const log = JSON.parse(readFileSync(path.join(reportRoot, DETEKT_REPORT), 'utf8'));
  return ingestSarif(identifiedBySubject(log), { tool: DETEKT_TOOL }).findings;
}

function identifiedBySubject(log) {
  return {
    ...log,
    runs: log.runs.map((run) => ({
      ...run,
      results: run.results.map((result) => ({
        ...result,
        partialFingerprints: result.partialFingerprints ?? {
          'nitpicker/subject': result.message.text,
        },
      })),
    })),
  };
}

function formatFindings(reportRoot, formatter) {
  return ingestFormatCheck(readFileSync(path.join(reportRoot, FORMAT_REPORT), 'utf8'), {
    tool: formatter,
    message: `File is not formatted with ${formatter}`,
  }).findings;
}
