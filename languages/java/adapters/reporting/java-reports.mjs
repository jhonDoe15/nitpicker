import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ingestArchunit } from '../../ingest/archunit.mjs';
import { readDuplicateFindings } from '../metrics/java-duplicates.mjs';
import { coveredByCpd } from '../../guards/cpd-duplicates.mjs';
import { readKotlinDuplicateFindings } from '../kotlin/kotlin-duplicates.mjs';
import {
  isEmptyModule,
  readMainCheckstyle,
  readModuleJacoco,
  readReportModules,
} from '../gradle-reports/report-modules.mjs';
import { readErrorProneFindings } from '../errorprone/java-errorprone.mjs';
import { readInlineSuppressionFindings } from '../suppressions/java-suppressions.mjs';
import { readCommentFindings } from '../comments/java-comments.mjs';
import { readSpringConfigFindings } from '../spring/java-spring.mjs';
import { readGuardFindings } from '../../guards/index.mjs';
import { readSpringArchFindings } from '../spring-arch/spring-arch.mjs';
import { readJavaStructureFindings } from '../metrics/java-structure.mjs';
import { readClassLimitFindings } from '../size/class-limits.mjs';
import { checkstyleFindings, formatFindings } from './format-findings.mjs';
import { readTestConsoleFindings } from '../test-times/console-findings.mjs';
import { readUnrunTestFindings } from '../test-runs/unrun-tests.mjs';
import { sarifFindings } from './sarif/sarif-reports.mjs';
import { projectWideFindings } from '../../builds/project-wide.mjs';
import { applyRuleMessages } from '../../messages/rule-messages.mjs';
import {
  readKotlinFindings,
  requireKotlinManifest,
  sourceFileOf,
  sourceLocator,
} from './kotlin-reports.mjs';
import { readTestFailures, testResultFindings } from './outcomes/test-results.mjs';
import { skippedToolFindings, withoutCheckstyleParseSkips } from './outcomes/skipped-tools.mjs';

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
      withModuleIdentity(
        moduleContextFindings(projectRoot, module, { manifest, modules, options }),
        module,
      ),
    );
  return {
    findings: applyRuleMessages(
      [
        ...moduleFindings,
        ...readDuplicateFindings(reportBase, {
          projectRoot,
          skip: coveredByCpd(modules, projectRoot),
        }),
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
        ...readCommentFindings(projectRoot, lintedRoots(manifest)),
        ...springFindings(projectRoot, manifest, options),
      ],
      { preset, testRoots: manifest.testSourceRoots ?? [], javaStyle: options.javaStyle },
    ),
  };
}

function moduleContextFindings(projectRoot, module, { manifest, modules, options }) {
  const preset = options.preset ?? 'java';
  const { fileLimits: thresholds, exceptions, modulePath } = options;
  const testReport = readTestFailures(module.reportRoot);
  return readModuleFindings(
    {
      projectRoot,
      reactorRoot: options.reactorRoot ?? projectRoot,
      roots: projectRoots(projectRoot),
      reportRoot: module.reportRoot,
      manifest: module.manifest,
      module: { moduleDir: module.dir, modulePath: options.modulePath },
      sourceRoots: module.manifest.sourceRoots ?? [],
      lintedRoots: lintedRoots(module.manifest),
      allSourceRoots: manifest.sourceRoots,
      modules,
      kotlin: preset === 'kotlin' && module.manifest.kotlin === true,
      formatAdvice: options.formatAdvice,
      conventions: options.conventions,
      javaStyle: options.javaStyle,
      classLimits: { thresholds, exceptions, modulePath },
      testReport,
      testScope: { snapshot: options.baseline?.snapshot, moduleLabel: modulePath || module.dir },
      jacoco: testReport.skipped.some(({ tool }) => tool === 'jacoco')
        ? undefined
        : readModuleJacoco(module, preset),
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
  const { reportRoot, projectRoot, kotlin } = context;
  const testRoots = testRootsOf(context.manifest);
  return [
    ...sarifFindings(context),
    ...readErrorProneFindings(context),
    ...formatFindings(context),
    ...skippedToolFindings(context),
    ...withoutCheckstyleParseSkips(checkstyleFindings(context), context.testScope),
    ...archunitFindings(context),
    ...springArchFindings(context),
    ...readJavaStructureFindings(reportRoot, projectRoot, context.reactorRoot),
    ...readClassLimitFindings(reportRoot, context.classLimits),
    ...(kotlin ? readKotlinFindings(context, crapLimit) : []),
    ...readGuardFindings({
      ...context,
      locate: sourceLocator(projectRoot, lintedRoots(context.manifest)),
    }),
    ...testResultFindings(context, crapLimit),
    ...readTestConsoleFindings({ reportRoot, projectRoot, testRoots }, context.testConsole),
    ...readUnrunTestFindings({
      reportRoot,
      projectRoot,
      manifest: context.manifest,
      modulePath: context.testTimes.modulePath,
    }),
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
        sourceRoots: [
          ...new Set([...(manifest.sourceRoots ?? []), ...(manifest.kotlinSourceRoots ?? [])]),
        ],
        resourceRoots: manifest.resourceRoots,
        testSourceRoots: manifest.testSourceRoots,
        baselineRoot: baselineRootOf(options),
      })
    : [];
}

function classLocator({ projectRoot, sourceRoots, manifest }) {
  return sourceLocator(projectRoot, [
    ...sourceRoots,
    ...(manifest.testSourceRoots ?? []),
    ...(manifest.kotlinSourceRoots ?? []),
    ...(manifest.kotlinTestSourceRoots ?? []),
  ]);
}

function springArchFindings(context) {
  if (context.manifest.springArch !== true) {
    return [];
  }
  const locate = classLocator(context);
  return readSpringArchFindings(context.reportRoot, {
    resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
  });
}

function archunitFindings({ reportRoot, projectRoot, sourceRoots, manifest }) {
  const archunitRoot = path.join(reportRoot, 'archunit');
  const archunitReports = existsSync(archunitRoot)
    ? readdirSync(archunitRoot)
        .filter((name) => name.endsWith('.xml'))
        .sort()
    : [];
  const locate = classLocator({ projectRoot, sourceRoots, manifest });
  return archunitReports.flatMap(
    (name) =>
      ingestArchunit(readFileSync(path.join(archunitRoot, name), 'utf8'), {
        resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
      }).findings,
  );
}

function projectRoots(projectRoot) {
  const roots = new Set([path.resolve(projectRoot)]);
  roots.add(realpathSync(projectRoot));
  return [...roots];
}
