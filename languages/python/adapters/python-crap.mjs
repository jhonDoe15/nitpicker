import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hash } from '../../../shared/rules/finding-helpers.mjs';
import { ingestPythonCrap } from '../ingest/crap.mjs';
import { execute, run } from './python-process.mjs';
import { functionText, writeSourceListing } from './python-sources.mjs';

export const LIZARD_REPORT = 'lizard.csv';
const LIZARD_RULE = 'lizard-failed';
const LIZARD_OVERRIDE = 'NITPICKER_LIZARD';
export const PINNED_VERSIONS_SOURCE = path.resolve(
  import.meta.dirname,
  '../../java/gradle/nitpicker.init.gradle',
);

export function pinnedLizardVersion() {
  return /lizard\s*:\s*'([^']+)'/.exec(readFileSync(PINNED_VERSIONS_SOURCE, 'utf8'))[1];
}

function lizardCandidates() {
  const override = process.env[LIZARD_OVERRIDE];
  return override === undefined || override === '' ? [['lizard']] : [[override]];
}

function reportedVersion(context, candidate) {
  const result = execute(context, [...candidate, '--version']);
  return result.error !== undefined || result.status !== 0 ? 'not runnable' : result.stdout.trim();
}

export function findLizard(context) {
  const version = pinnedLizardVersion();
  const probed = lizardCandidates().map((candidate) => ({
    candidate,
    reported: reportedVersion(context, candidate),
  }));
  const found = probed.find(({ reported }) => reported === version);
  if (found !== undefined) {
    return found.candidate;
  }
  const tried = probed.map(({ candidate, reported }) => `${candidate.join(' ')}: ${reported}`);
  throw Object.assign(
    new Error(
      `lizard ${version} is required for the CRAP check but was not found (${tried.join('; ')}). Install it in the project environment (\`pip install lizard==${version}\` or \`uv tool install lizard==${version}\`), or set ${LIZARD_OVERRIDE} to its executable.`,
    ),
    { rule: LIZARD_RULE },
  );
}

export function crap(context) {
  const { files, listing } = writeSourceListing(context);
  const report = path.join(context.reportRoot, LIZARD_REPORT);
  if (files.length === 0) {
    writeFileSync(report, '');
    return;
  }
  const command = [...findLizard(context), '--csv', '-l', 'python', '-f', listing];
  writeFileSync(report, run(context, command, { rule: LIZARD_RULE }).stdout);
}

export function readPythonCrapFindings({ lizard, coverage, projectRoot, roots, crapLimit }) {
  const sources = new Map();
  return ingestPythonCrap(lizard, coverage, {
    roots,
    limit: crapLimit,
    sourceHash: (entry) => hash(functionText(sources, projectRoot, entry)),
  }).findings;
}
