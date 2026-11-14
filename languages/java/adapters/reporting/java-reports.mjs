import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { buildViews } from '../kotlin/review-rules/build-view.mjs';
import { ingestCrap } from '../../ingest/crap.mjs';
import { coveredByCpd } from '../../guards/cpd-duplicates.mjs';
import { readProjectDuplicateFindings } from '../kotlin/kotlin-duplicates.mjs';
import {
  isEmptyModule,
  readMainCheckstyle,
  readModuleJacoco,
  readReportModules,
  withModuleIdentity,
  withoutExcludedFiles,
} from '../gradle-reports/report-modules.mjs';
import { readErrorProneFindings } from '../errorprone/java-errorprone.mjs';
import { readCommentFindings } from '../comments/comment-findings.mjs';
import { readInlineSuppressionFindings } from '../suppressions/java-suppressions.mjs';
import { readSpringConfigFindings } from '../spring/java-spring.mjs';
import { readGuardFindings } from '../../guards/index.mjs';
import { withEffectsFindings } from '../effects/effects-findings.mjs';
import { archunitFindings, springArchFindings } from './archunit/archunit-findings.mjs';
import { javaMethodText, readJavaStructureFindings } from '../metrics/java-structure.mjs';
import { testRunFindings } from '../test-runs/test-run-findings.mjs';
import { readClassLimitFindings } from '../size/class-limits.mjs';
import {
  declarationUnits,
  functionLocator,
  modulesUnitLocator,
  sourceTextReader,
  structureFunctions,
} from './function-locator.mjs';
import { checkstyleFindings, formatFindings } from './format-findings.mjs';
import { withoutMainMethodFindings } from './entry-point/main-method.mjs';
import { readDocCommentFindings } from '../doc-comments/doc-comment-findings.mjs';
import { ingestJacoco } from '../../ingest/coverage-reports/jacoco.mjs';
import { ingestPit } from '../../ingest/pit.mjs';
import { ingestJacocoBranches } from '../../ingest/coverage-reports/jacoco-branches.mjs';
import { sarifFindings } from './sarif/sarif-reports.mjs';
import { projectWideReport, reportModuleProjects } from '../../builds/project-wide.mjs';
import { applyRuleMessages } from '../../messages/rule-messages.mjs';
import {
  jacocoSourceRoots,
  readKotlinFindings,
  kotlinGeneratedFilter,
  requireKotlinManifest,
  sourceFileOf,
  sourceLocator,
} from './kotlin-reports.mjs';
import { withJavaCountRatchets } from './counts/java-counts.mjs';
import { foreignKeyGate } from '../jpa/foreign-keys/key-gate.mjs';
import { pitFailureFindings } from '../../builds/pit-failure/pit-failure.mjs';
import { pitSkippedFindings } from '../../builds/pit-failure/pit-skipped.mjs';

const ROOT_MODULE = 'root';

export function readJavaFindings(projectRoot, options = {}) {
  const { reportBase, report, preset = 'java', projectWide = true } = options;
  const kotlinPreset = preset === 'kotlin';
  const { modules, manifest } = report ?? readReportModules(reportBase, preset);
  if (kotlinPreset && options.requireKotlin !== false) {
    requireKotlinManifest(manifest);
  }
  const run = { kotlinBuild: buildViews(), foreignKeys: foreignKeyGate(projectRoot) };
  const moduleFindings = modules
    .filter((module) => !isEmptyModule(projectRoot, module))
    .flatMap((module) =>
      withModuleIdentity(
        moduleContextFindings(projectRoot, module, { manifest, modules, options, ...run }),
        module,
      ),
    );
  const wide = projectWide
    ? projectWideReport(projectRoot, {
        projects: reportModuleProjects(modules, ROOT_MODULE),
        mergedRoot: path.join(reportBase, 'project'),
        manifest,
        kotlin: kotlinPreset,
        policy: options,
      })
    : { findings: [], imports: undefined };
  const findings = applyRuleMessages(
    [
      ...moduleFindings,
      ...(projectWide
        ? readProjectDuplicateFindings(reportBase, {
            preset,
            projectRoot,
            skip: coveredByCpd(modules, projectRoot),
          })
        : []),
      ...wide.findings,
      ...readInlineSuppressionFindings(projectRoot, lintedRoots(manifest)),
      ...readCommentFindings(projectRoot, lintedRoots(manifest)),
      ...springFindings(projectRoot, manifest, options),
    ],
    { preset, javaStyle: options.javaStyle },
  );
  const locate = modulesUnitLocator(projectRoot, modules, kotlinPreset);
  return {
    findings: withJavaCountRatchets(withoutExcludedFiles(findings, modules), locate),
    imports: wide.imports,
  };
}

function moduleContextFindings(projectRoot, module, { manifest, modules, options, ...run }) {
  const preset = options.preset ?? 'java';
  const { fileLimits: thresholds, exceptions, modulePath } = options;
  const findings = readModuleFindings(
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
      ...run,
      kotlin: preset === 'kotlin' && module.manifest.kotlin === true,
      formatAdvice: options.formatAdvice,
      conventions: options.conventions,
      javaStyle: options.javaStyle,
      classLimits: { thresholds, exceptions, modulePath },
      quick: options.quick === true,
      mutationOff: options.mutationOff === true,
      jacoco:
        options.quick === true || module.manifest.testsFailed === true
          ? undefined
          : readModuleJacoco(module, preset),
      mainCheckstyle: readMainCheckstyle(projectRoot, module, preset),
      testTimes: {
        limits: options.testSeconds,
        baseline: options.baseline,
        modulePath,
      },
      featureLayout: { layout: options.featureLayout, modulePath },
      testConsole: {
        allow: options.testConsoleAllow,
        exceptions: options.exceptions,
        modulePath: options.modulePath,
        moduleRoot: module.dir,
      },
    },
    options.crapLimit,
  );
  return withoutMainMethodFindings(findings, sourceTextReader(projectRoot));
}

function ifTested(jacoco, build) {
  return jacoco === undefined ? [] : build(jacoco);
}

function readModuleFindings(context, crapLimit) {
  const { reportRoot, projectRoot, kotlin, jacoco } = context;
  const { testSourceRoots = [], kotlinTestSourceRoots = [] } = context.manifest;
  const testRoots = [...testSourceRoots, ...kotlinTestSourceRoots];
  return withEffectsFindings(context, [
    ...sarifFindings(context),
    ...readErrorProneFindings(context),
    ...formatFindings(context),
    ...checkstyleFindings(context),
    ...ifTested(jacoco, (report) => jacocoFindings(context, report)),
    ...archunitFindings(context),
    ...springArchFindings(context),
    ...ifTested(jacoco, (report) => crapFindings(context, report, crapLimit)),
    ...(context.quick || context.mutationOff ? [] : pitFindings(context)),
    ...readJavaStructureFindings(reportRoot, projectRoot, context.reactorRoot),
    ...readDocCommentFindings({ projectRoot, manifest: context.manifest, kotlin }),
    ...readClassLimitFindings(reportRoot, context.classLimits),
    ...ifTested(jacoco, (report) => branchFindings(context, report)),
    ...(kotlin ? readKotlinFindings(context, crapLimit) : []),
    ...readGuardFindings({
      ...context,
      locate: sourceLocator(projectRoot, lintedRoots(context.manifest)),
    }),
    ...testRunFindings(context, { reportRoot, projectRoot, testRoots }),
  ]);
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
        ...manifest,
        sourceRoots: [
          ...new Set([...(manifest.sourceRoots ?? []), ...(manifest.kotlinSourceRoots ?? [])]),
        ],
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

function crapFindings({ reportRoot, sourceRoots, projectRoot, reactorRoot }, jacoco, crapLimit) {
  const sources = new Map();
  const structure = JSON.parse(readFileSync(path.join(reportRoot, 'structure.json'), 'utf8'));
  return ingestCrap(structure, jacoco, {
    sourceRoots,
    limit: crapLimit,
    sourceText: (entry) =>
      existsSync(path.join(projectRoot, entry.file))
        ? javaMethodText(sources, { projectRoot, reactorRoot }, entry)
        : undefined,
  }).findings;
}

function pitFindings(context) {
  const { reportRoot, projectRoot } = context;
  const pitReport = path.join(reportRoot, 'pit/mutations.xml');
  if (context.manifest.testsFailed === true) {
    return [];
  }
  const failures = pitFailureFindings(reportRoot, context.module?.moduleDir);
  if (failures.length > 0 || !existsSync(pitReport)) {
    return failures;
  }
  const locate = sourceLocator(projectRoot, jacocoSourceRoots(context));
  const mutations = ingestPit(readFileSync(pitReport, 'utf8'), {
    resolvePath: (className, sourceFile) => sourceFileOf(locate, className, sourceFile),
    functionAt: functionLocator(context),
    sourceText: sourceTextReader(projectRoot),
    ...(context.kotlin ? { generated: kotlinGeneratedFilter(context) } : {}),
  }).findings;
  return [...mutations, ...pitSkippedFindings(reportRoot, context.module?.moduleDir)];
}

function branchFindings(context, jacoco) {
  const { projectRoot } = context;
  return ingestJacocoBranches(jacoco, {
    functions: structureFunctions(context),
    units: declarationUnits,
    locate: sourceLocator(projectRoot, jacocoSourceRoots(context)),
    sourceText: sourceTextReader(projectRoot),
  }).findings;
}

function projectRoots(projectRoot) {
  const roots = new Set([path.resolve(projectRoot)]);
  roots.add(realpathSync(projectRoot));
  roots.add(realpathSync.native(projectRoot));
  return [...roots];
}
