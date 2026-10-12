import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readCouplingFindings } from './java-coupling.mjs';
import { ingestCheckstyle } from '../ingest/checkstyle.mjs';
import { ingestArchunit } from '../ingest/archunit.mjs';
import { ingestCrap } from '../ingest/crap.mjs';
import { readDuplicateFindings } from './java-duplicates.mjs';
import {
  methodText,
  readJavaFileLimitFindings,
  readJavaStructureFindings,
} from './java-structure.mjs';
import { hash } from '../../../shared/rules/finding-helpers.mjs';
import { ingestFormatCheck } from '../ingest/format-check.mjs';
import { ingestJacoco } from '../ingest/jacoco.mjs';
import { ingestPit } from '../ingest/pit.mjs';
import { ingestJacocoBranches } from '../ingest/jacoco-branches.mjs';
import { ingestSarif, normalizeUri } from '../ingest/sarif.mjs';

export const REPORT_DIRECTORY = 'build/nitpicker';

export function readJavaFindings(projectRoot, { crapLimit, fileLimits, exclude } = {}) {
  const reportRoot = path.join(projectRoot, REPORT_DIRECTORY);
  const manifest = JSON.parse(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
  const context = {
    projectRoot,
    reportRoot,
    manifest,
    sourceRoots: manifest.sourceRoots ?? [],
    roots: projectRoots(projectRoot),
    jacoco: readFileSync(path.join(reportRoot, 'jacoco.xml'), 'utf8'),
  };
  return {
    findings: [
      ...sarifFindings(context),
      ...formatFindings(context),
      ...checkstyleFindings(context),
      ...readDuplicateFindings(reportRoot),
      ...jacocoFindings(context, context.jacoco),
      ...archunitFindings(context),
      ...crapFindings(context, context.jacoco, crapLimit),
      ...pitFindings(context),
      ...readJavaStructureFindings(reportRoot, projectRoot),
      ...readJavaFileLimitFindings(projectRoot, { manifest, fileLimits, exclude }),
      ...branchFindings(context, context.jacoco),
      ...readCouplingFindings(reportRoot, { projectRoot, sourceRoots: context.sourceRoots }),
    ],
  };
}

function sarifFindings({ reportRoot, roots, sourceRoots, projectRoot }) {
  const findings = [];
  function sarif(file, tool, identityKey) {
    const log = JSON.parse(readFileSync(path.join(reportRoot, file), 'utf8'));
    const normalized = prepareSarif(log, { roots, sourceRoots, projectRoot, identityKey });
    findings.push(...ingestSarif(normalized, { tool }).findings);
  }
  sarif('pmd.sarif', 'pmd', (result) => result.message?.text);
  sarif('spotbugs.sarif', 'spotbugs', (result) => spotbugsSubject(result));
  return findings;
}

function formatFindings({ reportRoot, roots }) {
  const formatLines = readFileSync(path.join(reportRoot, 'format.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => projectRelative(line.trim(), roots) ?? line);
  return ingestFormatCheck(formatLines.join('\n'), {
    tool: 'google-java-format',
    message: 'File is not formatted with google-java-format',
  }).findings;
}

function checkstyleFindings({ reportRoot, roots, projectRoot }) {
  const checkstyle = readFileSync(path.join(reportRoot, 'checkstyle.xml'), 'utf8');
  return roots.flatMap((root) =>
    ingestCheckstyle(checkstyle, { root }).findings.filter((finding) =>
      existsSync(path.join(projectRoot, finding.path)),
    ),
  );
}

function jacocoFindings({ sourceRoots, projectRoot }, jacoco) {
  return sourceRoots.flatMap((sourceRoot) =>
    ingestJacoco(jacoco, { sourceRoot }).findings.filter((finding) =>
      existsSync(path.join(projectRoot, finding.path)),
    ),
  );
}

function archunitFindings({ reportRoot, projectRoot, sourceRoots, manifest }) {
  const archunitRoot = path.join(reportRoot, 'archunit');
  const archunitReports = existsSync(archunitRoot)
    ? readdirSync(archunitRoot)
        .filter((name) => name.endsWith('.xml'))
        .sort()
    : [];
  const classRoots = [...sourceRoots, ...(manifest.testSourceRoots ?? [])];
  return archunitReports.flatMap(
    (name) =>
      ingestArchunit(readFileSync(path.join(archunitRoot, name), 'utf8'), {
        resolvePath: (className, fileName) =>
          sourceFileOf(projectRoot, classRoots, className, fileName),
      }).findings,
  );
}

function crapFindings({ reportRoot, sourceRoots, projectRoot }, jacoco, crapLimit) {
  const sources = new Map();
  return ingestCrap(readFileSync(path.join(reportRoot, 'lizard.csv'), 'utf8'), jacoco, {
    sourceRoots,
    limit: crapLimit,
    sourceHash: (entry) =>
      existsSync(path.join(projectRoot, entry.file))
        ? hash(methodText(sources, projectRoot, entry))
        : undefined,
  }).findings;
}

function pitFindings({ reportRoot, projectRoot, sourceRoots }) {
  const pitReport = path.join(reportRoot, 'pit/mutations.xml');
  if (!existsSync(pitReport)) {
    return [];
  }
  return ingestPit(readFileSync(pitReport, 'utf8'), {
    resolvePath: (className, sourceFile) =>
      sourceFileOf(projectRoot, sourceRoots, className, sourceFile),
  }).findings;
}

function branchFindings({ projectRoot, sourceRoots }, jacoco) {
  return sourceRoots.flatMap(
    (sourceRoot) =>
      ingestJacocoBranches(jacoco, {
        sourceRoot,
        sourceText: (file) => {
          const absolute = path.join(projectRoot, file);
          return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
        },
      }).findings,
  );
}

function sourceFileOf(projectRoot, sourceRoots, className, fileName) {
  const parts = className.split('.');
  const simple = parts.pop().split('$')[0];
  const directory = parts.join('/');
  const relative = `${directory === '' ? '' : `${directory}/`}${fileName ?? `${simple}.java`}`;
  return sourceRoots
    .map((sourceRoot) => `${sourceRoot}/${relative}`)
    .find((candidate) => existsSync(path.join(projectRoot, candidate)));
}

function projectRoots(projectRoot) {
  const roots = new Set([path.resolve(projectRoot)]);
  roots.add(realpathSync(projectRoot));
  return [...roots];
}

function spotbugsSubject(result) {
  const args = result.message?.arguments;
  return Array.isArray(args) && args.length > 0 ? args.join(' ') : result.message?.text;
}

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
    return uri;
  }
  const owner = sourceRoots.find((sourceRoot) =>
    existsSync(path.join(projectRoot, sourceRoot, relative)),
  );
  return owner === undefined ? relative : `${owner}/${relative}`;
}
