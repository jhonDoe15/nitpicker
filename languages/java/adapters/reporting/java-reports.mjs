import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ingestArchunit } from '../../ingest/archunit.mjs';
import { ingestCrap } from '../../ingest/crap.mjs';
import { readDuplicateFindings } from '../metrics/java-duplicates.mjs';
import { readKotlinDuplicateFindings } from '../kotlin/kotlin-duplicates.mjs';
import {
  isEmptyModule,
  readMainCheckstyle,
  readModuleJacoco,
  readReportModules,
} from '../gradle-reports/report-modules.mjs';
import { readErrorProneFindings } from '../errorprone/java-errorprone.mjs';
import { readInlineSuppressionFindings } from '../suppressions/java-suppressions.mjs';
import { readSpringConfigFindings } from '../spring/java-spring.mjs';
import { readJavaStructureFindings } from '../metrics/java-structure.mjs';
import { methodText } from '../../../../shared/ingest/structure-report.mjs';
import { readClassLimitFindings } from '../size/class-limits.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { checkstyleFindings, formatFindings } from './format-findings.mjs';
import { readSlowTestFindings } from '../test-times/slow-tests.mjs';
import { readTestConsoleFindings } from '../test-times/console-findings.mjs';
import { ingestJacoco } from '../../ingest/coverage-reports/jacoco.mjs';
import { ingestPit } from '../../ingest/pit.mjs';
import { ingestJacocoBranches } from '../../ingest/coverage-reports/jacoco-branches.mjs';
import { sarifFindings } from './sarif/sarif-reports.mjs';
import { projectWideFindings } from '../../builds/project-wide.mjs';
import { applyRuleMessages } from '../../messages/rule-messages.mjs';
import {
  jacocoSourceRoots,
  readKotlinFindings,
  reportOnlyKotlinMutants,
  requireKotlinManifest,
  sourceFileOf,
  sourceLocator,
} from './kotlin-reports.mjs';

const MODULE_IDENTITY_SEPARATOR = '@';
const ROOT_MODULE = 'root';

export function readJavaFindings(projectRoot, options = {}) {
  const { reportBase, report, preset = 'java', projectWide = true } = options;
  const kotlinPreset = preset === 'kotlin';
  const { modules, manifest } = report ?? readReportModules(reportBase, preset);
  if (kotlinPreset) {
    requireKotlinManifest(manifest);
  }
  const moduleFindings = modules
    .filter((module) => !isEmptyModule(projectRoot, module))
    .flatMap((module) =>
      withModuleIdentity(moduleContextFindings(projectRoot, module, { manifest, options }), module),
    );
  return {
    findings: applyRuleMessages(
      [
        ...moduleFindings,
        ...readDuplicateFindings(reportBase, { projectRoot }),
        ...(kotlinPreset ? readKotlinDuplicateFindings(reportBase, projectRoot) : []),
        ...(projectWide
          ? projectWideFindings(projectRoot, {
              projects: modules.map((module) => ({
                reportRoot: module.reportRoot,
                qualifier: module.key === ROOT_MODULE ? '' : module.dir,
                sourceRoots: module.manifest.sourceRoots ?? [],
                kotlinSourceRoots: module.manifest.kotlinSourceRoots ?? [],
                resourceRoots: module.manifest.resourceRoots ?? [],
              })),
              mergedRoot: path.join(reportBase, 'project'),
              manifest,
              kotlin: kotlinPreset,
              policy: options,
            })
          : []),
        ...readInlineSuppressionFindings(projectRoot, lintedRoots(manifest)),
        ...springFindings(projectRoot, manifest, options),
      ],
      { preset, javaStyle: options.javaStyle },
    ),
  };
}

function moduleContextFindings(projectRoot, module, { manifest, options }) {
  const preset = options.preset ?? 'java';
  const { fileLimits: thresholds, exceptions, modulePath } = options;
  return readModuleFindings(
    {
      projectRoot,
      roots: projectRoots(projectRoot),
      reportRoot: module.reportRoot,
      manifest: module.manifest,
      sourceRoots: module.manifest.sourceRoots ?? [],
      lintedRoots: lintedRoots(module.manifest),
      allSourceRoots: manifest.sourceRoots,
      kotlin: preset === 'kotlin' && module.manifest.kotlin === true,
      formatAdvice: options.formatAdvice,
      conventions: options.conventions,
      javaStyle: options.javaStyle,
      classLimits: { thresholds, exceptions, modulePath },
      jacoco: readModuleJacoco(module, preset),
      mainCheckstyle: readMainCheckstyle(projectRoot, module, preset),
      testTimes: {
        limits: options.testSeconds,
        baseline: options.baseline,
        modulePath,
      },
      testConsole: {
        allow: options.testConsoleAllow,
        exceptions: options.exceptions,
        modulePath: options.modulePath,
        moduleRoot: module.dir,
      },
    },
    options.crapLimit,
  );
}

function testRootsOf(manifest) {
  return [...(manifest.testSourceRoots ?? []), ...(manifest.kotlinTestSourceRoots ?? [])];
}

function readModuleFindings(context, crapLimit) {
  const { reportRoot, projectRoot, kotlin, jacoco } = context;
  const testRoots = testRootsOf(context.manifest);
  return [
    ...sarifFindings(context),
    ...readErrorProneFindings(context),
    ...formatFindings(context),
    ...checkstyleFindings(context),
    ...jacocoFindings(context, jacoco),
    ...archunitFindings(context),
    ...crapFindings(context, jacoco, crapLimit),
    ...pitFindings(context),
    ...readJavaStructureFindings(reportRoot, projectRoot),
    ...readClassLimitFindings(reportRoot, context.classLimits),
    ...branchFindings(context, jacoco),
    ...(kotlin ? readKotlinFindings(context, crapLimit) : []),
    ...readSlowTestFindings({ reportRoot, projectRoot, testRoots, ...context.testTimes }),
    ...readTestConsoleFindings({ reportRoot, projectRoot, testRoots }, context.testConsole),
  ];
}

function withModuleIdentity(findings, module) {
  return module.key === ROOT_MODULE
    ? findings
    : findings.map((finding) =>
        finding.path === '.'
          ? {
              ...finding,
              identity: `${finding.identity}${MODULE_IDENTITY_SEPARATOR}${module.path}`,
            }
          : finding,
      );
}

function lintedRoots({ sourceRoots = [], testSourceRoots = [] }) {
  return [...new Set([...sourceRoots, ...testSourceRoots])];
}

function baselineRootOf({ baseline, modulePath }) {
  return baseline?.snapshot === 'head' && baseline.baselineRoot !== undefined
    ? path.join(baseline.baselineRoot, modulePath ?? '')
    : undefined;
}

function springFindings(projectRoot, manifest, options) {
  return manifest.spring === true
    ? readSpringConfigFindings(projectRoot, {
        sourceRoots: manifest.sourceRoots,
        resourceRoots: manifest.resourceRoots,
        testSourceRoots: manifest.testSourceRoots,
        baselineRoot: baselineRootOf(options),
      })
    : [];
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
  const locate = sourceLocator(projectRoot, [
    ...sourceRoots,
    ...(manifest.testSourceRoots ?? []),
    ...(manifest.kotlinSourceRoots ?? []),
    ...(manifest.kotlinTestSourceRoots ?? []),
  ]);
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

function projectRoots(projectRoot) {
  const roots = new Set([path.resolve(projectRoot)]);
  roots.add(realpathSync(projectRoot));
  return [...roots];
}
