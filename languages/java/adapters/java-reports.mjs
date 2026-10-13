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
import { ingestFormatCheck } from '../../../shared/ingest/format-check.mjs';
import { ingestJacoco } from '../ingest/jacoco.mjs';
import { ingestPit } from '../ingest/pit.mjs';
import { ingestJacocoBranches } from '../ingest/jacoco-branches.mjs';
import { prepareSarif, projectRelative } from '../../../shared/ingest/prepare-sarif.mjs';
import { ingestSarif } from '../../../shared/ingest/sarif.mjs';
import { kotlinModules, readKotlinMetrics } from './kotlin-metrics.mjs';
import {
  jacocoSourceRoots,
  readKotlinFindings,
  reportOnlyKotlinMutants,
  requireKotlinManifest,
  sourceLocator,
} from './kotlin-reports.mjs';

export const REPORT_DIRECTORY = 'build/nitpicker';

export function readJavaFindings(
  projectRoot,
  { crapLimit, preset = 'java', fileLimits, exclude, exceptions } = {},
) {
  const kotlin = preset === 'kotlin';
  const reportRoot = path.join(projectRoot, REPORT_DIRECTORY);
  requireGradleReports(projectRoot, preset);
  const manifest = JSON.parse(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
  if (kotlin) {
    requireKotlinManifest(manifest);
  }
  const context = {
    projectRoot,
    reportRoot,
    manifest,
    sourceRoots: manifest.sourceRoots ?? [],
    roots: projectRoots(projectRoot),
    kotlin,
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
      ...readJavaFileLimitFindings(projectRoot, {
        manifest,
        kotlin,
        policy: { thresholds: fileLimits, exclude, exceptions },
      }),
      ...branchFindings(context, context.jacoco),
      ...readCouplingFindings(reportRoot, {
        projectRoot,
        sourceRoots: context.sourceRoots,
        kotlin: kotlin ? kotlinModules(readKotlinMetrics(reportRoot)) : undefined,
      }),
      ...(kotlin ? readKotlinFindings(context, crapLimit) : []),
    ],
  };
}

export function requireGradleReports(projectRoot, preset) {
  if (!existsSync(path.join(projectRoot, REPORT_DIRECTORY, 'manifest.json'))) {
    const plugin = preset === 'kotlin' ? 'org.jetbrains.kotlin.jvm' : 'java';
    throw new Error(
      `The ${preset} preset found no Gradle reports in ${REPORT_DIRECTORY}: the root project must apply the ${plugin} plugin. Reports of submodules are not read`,
    );
  }
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

function jacocoFindings(context, jacoco) {
  const { projectRoot } = context;
  return jacocoSourceRoots(context).flatMap((sourceRoot) =>
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
  const locate = sourceLocator(projectRoot, [...sourceRoots, ...(manifest.testSourceRoots ?? [])]);
  return archunitReports.flatMap(
    (name) =>
      ingestArchunit(readFileSync(path.join(archunitRoot, name), 'utf8'), {
        resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
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

function pitFindings(context) {
  const { reportRoot, projectRoot } = context;
  const pitReport = path.join(reportRoot, 'pit/mutations.xml');
  if (!existsSync(pitReport)) {
    return [];
  }
  const locate = sourceLocator(projectRoot, jacocoSourceRoots(context));
  const { findings } = ingestPit(readFileSync(pitReport, 'utf8'), {
    resolvePath: (className, sourceFile) => sourceFileOf(locate, className, sourceFile),
  });
  return context.kotlin ? reportOnlyKotlinMutants(findings) : findings;
}

function branchFindings(context, jacoco) {
  const { projectRoot } = context;
  return ingestJacocoBranches(jacoco, {
    locate: sourceLocator(projectRoot, jacocoSourceRoots(context)),
    sourceText: (file) => {
      const absolute = path.join(projectRoot, file);
      return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
    },
  }).findings;
}

function sourceFileOf(locate, className, fileName) {
  const parts = className.split('.');
  const simple = parts.pop().split('$')[0];
  return locate(parts.join('/'), fileName ?? `${simple}.java`);
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
