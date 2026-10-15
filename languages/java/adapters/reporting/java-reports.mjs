import { withPmdAdvice } from '../../guards/advice/pmd-advice.mjs';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readCouplingFindings } from '../metrics/java-coupling.mjs';
import { ingestCheckstyle } from '../../ingest/formatting/checkstyle.mjs';
import { ingestArchunit } from '../../ingest/archunit.mjs';
import { ingestCrap } from '../../ingest/crap.mjs';
import { readDuplicateFindings } from '../metrics/java-duplicates.mjs';
import { readInlineSuppressionFindings } from '../suppressions/java-suppressions.mjs';
import { readSpringConfigFindings } from '../spring/java-spring.mjs';
import { readGuardFindings } from '../../guards/index.mjs';
import {
  methodText,
  readJavaFileLimitFindings,
  readJavaStructureFindings,
} from '../metrics/java-structure.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { ingestJacoco } from '../../ingest/coverage-reports/jacoco.mjs';
import { ingestPit } from '../../ingest/pit.mjs';
import { ingestJacocoBranches } from '../../ingest/coverage-reports/jacoco-branches.mjs';
import { ingestSarif, prepareSarif, projectRelative } from '../../ingest/sarif.mjs';
import { kotlinModules, readKotlinMetrics } from '../kotlin/kotlin-metrics.mjs';
import {
  jacocoSourceRoots,
  readKotlinFindings,
  reportOnlyKotlinMutants,
  requireKotlinManifest,
  sourceLocator,
} from './kotlin-reports.mjs';

export const REPORT_DIRECTORY = 'build/nitpicker';
const LINE_NUMBER = /\bline \d+\b/g;

export function readJavaFindings(
  projectRoot,
  {
    crapLimit,
    preset = 'java',
    fileLimits,
    exclude,
    exceptions,
    reportDirectory = REPORT_DIRECTORY,
    projectWide = true,
  } = {},
) {
  const kotlin = preset === 'kotlin';
  const reportRoot = path.join(projectRoot, reportDirectory);
  const manifest = readManifest(projectRoot, { reportDirectory, preset });
  const context = {
    projectRoot,
    reportRoot,
    manifest,
    sourceRoots: manifest.sourceRoots ?? [],
    lintedRoots: lintedRoots(manifest),
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
      ...(projectWide ? projectWideFindings(context, { fileLimits, exclude, exceptions }) : []),
      ...branchFindings(context, context.jacoco),
      ...(kotlin ? readKotlinFindings(context, crapLimit) : []),
      ...readInlineSuppressionFindings(projectRoot, context.lintedRoots),
      ...guardFindings(context),
      ...springFindings(context),
    ],
  };
}

function guardFindings({ projectRoot, reportRoot, manifest, lintedRoots: roots }) {
  return readGuardFindings({
    reportRoot,
    projectRoot,
    manifest,
    locate: sourceLocator(projectRoot, roots),
  });
}

function readManifest(projectRoot, { reportDirectory, preset }) {
  if (reportDirectory === REPORT_DIRECTORY) {
    requireGradleReports(projectRoot, preset);
  }
  const manifest = JSON.parse(
    readFileSync(path.join(projectRoot, reportDirectory, 'manifest.json'), 'utf8'),
  );
  if (preset === 'kotlin') {
    requireKotlinManifest(manifest);
  }
  return manifest;
}

function projectWideFindings(context, { fileLimits, exclude, exceptions }) {
  const { projectRoot, reportRoot, manifest, kotlin } = context;
  return [
    ...readJavaFileLimitFindings(projectRoot, {
      manifest,
      kotlin,
      policy: { thresholds: fileLimits, exclude, exceptions },
    }),
    ...readCouplingFindings(reportRoot, {
      projectRoot,
      sourceRoots: context.sourceRoots,
      kotlin: kotlin ? kotlinModules(readKotlinMetrics(reportRoot)) : undefined,
    }),
  ];
}

function lintedRoots({ sourceRoots = [], testSourceRoots = [] }) {
  return [...new Set([...sourceRoots, ...testSourceRoots])];
}

export function requireGradleReports(projectRoot, preset) {
  if (!existsSync(path.join(projectRoot, REPORT_DIRECTORY, 'manifest.json'))) {
    const plugin = preset === 'kotlin' ? 'org.jetbrains.kotlin.jvm' : 'java';
    throw new Error(
      `The ${preset} preset found no Gradle reports in ${REPORT_DIRECTORY}: the root project must apply the ${plugin} plugin. Reports of submodules are not read`,
    );
  }
}

function springFindings({ projectRoot, manifest, sourceRoots }) {
  return manifest.spring === true
    ? readSpringConfigFindings(projectRoot, { sourceRoots, resourceRoots: manifest.resourceRoots })
    : [];
}

function sarifFindings({ reportRoot, roots, sourceRoots, projectRoot }) {
  const findings = [];
  function sarif(file, tool, identityKey) {
    const log = JSON.parse(readFileSync(path.join(reportRoot, file), 'utf8'));
    const normalized = prepareSarif(log, { roots, sourceRoots, projectRoot, identityKey });
    findings.push(...ingestSarif(normalized, { tool }).findings.map(withPmdAdvice));
  }
  sarif('pmd.sarif', 'pmd', (result) => result.message?.text?.replace(LINE_NUMBER, 'line'));
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
  const testReport = path.join(reportRoot, 'checkstyle-test.xml');
  return [
    path.join(reportRoot, 'checkstyle.xml'),
    ...(existsSync(testReport) ? [testReport] : []),
  ].flatMap((report) => {
    const checkstyle = readFileSync(report, 'utf8');
    return roots.flatMap((root) =>
      ingestCheckstyle(checkstyle, { root }).findings.filter((finding) =>
        existsSync(path.join(projectRoot, finding.path)),
      ),
    );
  });
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
  const structure = JSON.parse(readFileSync(path.join(reportRoot, 'structure.json'), 'utf8'));
  return ingestCrap(structure, jacoco, {
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
