import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings } from './java-duplicates.mjs';
import { ingestFormatCheck } from '../ingest/format-check.mjs';
import { ingestJacoco } from '../ingest/jacoco.mjs';
import { ingestSarif, normalizeUri } from '../ingest/sarif.mjs';

// Reads the reports written by java/nitpicker.init.gradle (build/nitpicker/*) and turns them into
// findings with the shared ingesters. The reports are Gradle-project relative; findings paths are
// relative to `projectRoot`.

export const REPORT_DIRECTORY = 'build/nitpicker';

export function readJavaFindings(projectRoot) {
  const reportRoot = path.join(projectRoot, REPORT_DIRECTORY);
  const manifest = JSON.parse(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
  const sourceRoots = manifest.sourceRoots ?? [];
  const roots = projectRoots(projectRoot);
  const findings = [];

  const sarif = (file, tool, identityKey) => {
    const log = JSON.parse(readFileSync(path.join(reportRoot, file), 'utf8'));
    const normalized = prepareSarif(log, { roots, sourceRoots, projectRoot, identityKey });
    findings.push(...ingestSarif(normalized, { tool }).findings);
  };
  sarif('pmd.sarif', 'pmd', (result) => result.message?.text);
  sarif('spotbugs.sarif', 'spotbugs', (result) => spotbugsSubject(result));

  const formatLines = readFileSync(path.join(reportRoot, 'format.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => projectRelative(line.trim(), roots) ?? line);
  findings.push(
    ...ingestFormatCheck(formatLines.join('\n'), {
      tool: 'google-java-format',
      message: 'File is not formatted with google-java-format',
    }).findings,
  );

  findings.push(...readDuplicateFindings(reportRoot));

  const jacoco = readFileSync(path.join(reportRoot, 'jacoco.xml'), 'utf8');
  for (const sourceRoot of sourceRoots) {
    findings.push(
      ...ingestJacoco(jacoco, { sourceRoot }).findings.filter((finding) =>
        existsSync(path.join(projectRoot, finding.path)),
      ),
    );
  }
  return { findings };
}

function projectRoots(projectRoot) {
  const roots = new Set([path.resolve(projectRoot)]);
  roots.add(realpathSync(projectRoot));
  return [...roots];
}

// SpotBugs names the subject (class, method, field) in the message arguments; that is what the
// identity needs, since the message text alone is generic.
function spotbugsSubject(result) {
  const args = result.message?.arguments;
  return Array.isArray(args) && args.length > 0 ? args.join(' ') : result.message?.text;
}

// Makes a PMD or SpotBugs SARIF log ingestible as-is:
//  - artifact URIs become project-relative (PMD writes absolute file:// URIs, SpotBugs writes
//    paths relative to a source root);
//  - results without partialFingerprints get one from `identityKey` (rule and path are already part
//    of the finding key), so identity follows what the finding is about, never its line;
//  - SpotBugs reports lower-confidence results at level `note`. The Java preset decides what is
//    reported by running the tool at its configured threshold, so every reported result is
//    enforceable.
export function prepareSarif(log, { roots, sourceRoots, projectRoot, identityKey }) {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).map((result) =>
        prepareResult(result, { roots, sourceRoots, projectRoot, identityKey }),
      ),
    })),
  };
}

function prepareResult(result, { roots, sourceRoots, projectRoot, identityKey }) {
  const subject = identityKey(result);
  const prepared = {
    ...result,
    level: result.level === 'error' ? 'error' : 'warning',
    locations: (result.locations ?? []).map((location) =>
      relocate(location, { roots, sourceRoots, projectRoot }),
    ),
  };
  if (typeof subject === 'string' && subject !== '' && result.partialFingerprints === undefined) {
    prepared.partialFingerprints = { 'nitpicker/subject': subject };
  }
  return prepared;
}

function relocate(location, { roots, sourceRoots, projectRoot }) {
  const uri = location.physicalLocation?.artifactLocation?.uri;
  if (typeof uri !== 'string') {
    return location;
  }
  const resolved = resolveUri(uri, { roots, sourceRoots, projectRoot });
  return {
    ...location,
    physicalLocation: {
      ...location.physicalLocation,
      artifactLocation: { uri: resolved },
    },
  };
}

function projectRelative(uri, roots) {
  for (const root of roots) {
    const relative = normalizeUri(uri, root);
    if (relative !== undefined) {
      return relative;
    }
  }
  return undefined;
}

function resolveUri(uri, { roots, sourceRoots, projectRoot }) {
  const relative = projectRelative(uri, roots);
  if (relative === undefined) {
    return uri; // outside the project: the ingester skips it
  }
  const owner = sourceRoots.find((sourceRoot) =>
    existsSync(path.join(projectRoot, sourceRoot, relative)),
  );
  return owner === undefined ? relative : `${owner}/${relative}`;
}
