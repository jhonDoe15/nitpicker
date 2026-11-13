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
import { readInlineSuppressionFindings } from '../suppressions/java-suppressions.mjs';
import { readSpringConfigFindings } from '../spring/java-spring.mjs';
import { readGuardFindings } from '../../guards/index.mjs';
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
import { callUntyped } from '../typed/java-values.mts';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type Options = Readonly<Record<string, unknown>>;
type Findings = readonly unknown[];
type ReportRun = { readonly kotlinBuild: unknown; readonly foreignKeys: unknown };
type ModuleRun = ReportRun & { manifest: unknown; modules: readonly unknown[]; options: Options };
type ModuleContext = Options & {
  projectRoot: string;
  reportRoot: string;
  kotlin: boolean;
  quick: boolean;
};
type JavaReadout = { readonly findings: unknown; readonly imports: unknown };

function listsOf(manifest: unknown, ...lists: readonly string[]): string[] {
  return lists.flatMap((list) => textsOf(fieldOf(manifest, list)));
}

function lintedRoots(manifest: unknown): string[] {
  return [...new Set(listsOf(manifest, 'sourceRoots', 'testSourceRoots'))];
}

function projectRoots(projectRoot: string): string[] {
  const roots = [path.resolve(projectRoot), realpathSync(projectRoot)];
  return [...new Set([...roots, realpathSync.native(projectRoot)])];
}

function baselineRootOf(options: Options): string | undefined {
  const baseline = options['baseline'];
  const root = fieldOf(baseline, 'baselineRoot');
  return fieldOf(baseline, 'snapshot') === 'head' && root !== undefined
    ? path.join(textOf(root), textOf(options['modulePath'] ?? ''))
    : undefined;
}

function springFindings(projectRoot: string, manifest: unknown, options: Options): Findings {
  return fieldOf(manifest, 'spring') === true
    ? findingsFrom(readSpringConfigFindings, projectRoot, {
        ...fieldsOf(manifest),
        sourceRoots: [...new Set(listsOf(manifest, 'sourceRoots', 'kotlinSourceRoots'))],
        baselineRoot: baselineRootOf(options),
      })
    : [];
}

function findingsFrom(read: unknown, ...args: readonly unknown[]): Findings {
  return listOf(callUntyped(read, ...args));
}

function ifTested(jacoco: unknown, build: (report: unknown) => Findings): Findings {
  return jacoco === undefined ? [] : build(jacoco);
}

function jacocoFindings(context: ModuleContext, jacoco: unknown): Findings {
  return textsOf(callUntyped(jacocoSourceRoots, context)).flatMap((sourceRoot) =>
    listOf(fieldOf(callUntyped(ingestJacoco, jacoco, { sourceRoot }), 'findings')).filter(
      (finding) => existsSync(path.join(context.projectRoot, textOf(fieldOf(finding, 'path')))),
    ),
  );
}

function crapFindings(context: ModuleContext, jacoco: unknown, crapLimit: unknown): Findings {
  const { reportRoot, projectRoot, reactorRoot } = context;
  const sources = new Map();
  const file = path.join(reportRoot, 'structure.json');
  const structure: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const crap = callUntyped(ingestCrap, structure, jacoco, {
    sourceRoots: context['sourceRoots'],
    limit: crapLimit,
    sourceText: (entry: unknown) =>
      existsSync(path.join(projectRoot, textOf(fieldOf(entry, 'file'))))
        ? callUntyped(javaMethodText, sources, { projectRoot, reactorRoot }, entry)
        : undefined,
  });
  return listOf(fieldOf(crap, 'findings'));
}

function jacocoLocator(context: ModuleContext): unknown {
  return callUntyped(sourceLocator, context.projectRoot, callUntyped(jacocoSourceRoots, context));
}

function pitFindings(context: ModuleContext): Findings {
  const { reportRoot, projectRoot } = context;
  const pitReport = path.join(reportRoot, 'pit/mutations.xml');
  const failures =
    fieldOf(context['manifest'], 'testsFailed') === true
      ? []
      : findingsFrom(pitFailureFindings, reportRoot, fieldOf(context['module'], 'moduleDir'));
  if (failures.length > 0 || !existsSync(pitReport)) {
    return failures;
  }
  const locate = jacocoLocator(context);
  const pit = callUntyped(ingestPit, readFileSync(pitReport, 'utf8'), {
    resolvePath: (className: unknown, sourceFile: unknown) =>
      callUntyped(sourceFileOf, locate, className, sourceFile),
    functionAt: callUntyped(functionLocator, context),
    sourceText: sourceTextReader(projectRoot),
    ...(context.kotlin ? { generated: callUntyped(kotlinGeneratedFilter, context) } : {}),
  });
  return listOf(fieldOf(pit, 'findings'));
}

function branchFindings(context: ModuleContext, jacoco: unknown): Findings {
  const branches = callUntyped(ingestJacocoBranches, jacoco, {
    functions: callUntyped(structureFunctions, context),
    units: declarationUnits,
    locate: jacocoLocator(context),
    sourceText: sourceTextReader(context.projectRoot),
  });
  return listOf(fieldOf(branches, 'findings'));
}

function coverageFindings(context: ModuleContext, crapLimit: unknown): Findings {
  return [
    ...ifTested(context['jacoco'], (report) => jacocoFindings(context, report)),
    ...findingsFrom(archunitFindings, context),
    ...findingsFrom(springArchFindings, context),
    ...ifTested(context['jacoco'], (report) => crapFindings(context, report, crapLimit)),
    ...(context.quick ? [] : pitFindings(context)),
  ];
}

function readModuleFindings(context: ModuleContext, crapLimit: unknown): Findings {
  const { reportRoot, projectRoot, kotlin } = context;
  const testRoots = listsOf(context['manifest'], 'testSourceRoots', 'kotlinTestSourceRoots');
  return [
    ...findingsFrom(sarifFindings, context),
    ...findingsFrom(readErrorProneFindings, context),
    ...findingsFrom(formatFindings, context),
    ...findingsFrom(checkstyleFindings, context),
    ...coverageFindings(context, crapLimit),
    ...findingsFrom(readJavaStructureFindings, reportRoot, projectRoot, context['reactorRoot']),
    ...findingsFrom(readDocCommentFindings, { projectRoot, manifest: context['manifest'], kotlin }),
    ...findingsFrom(readClassLimitFindings, reportRoot, context['classLimits']),
    ...ifTested(context['jacoco'], (report) => branchFindings(context, report)),
    ...(kotlin ? findingsFrom(readKotlinFindings, context, crapLimit) : []),
    ...findingsFrom(readGuardFindings, {
      ...context,
      locate: sourceLocator(projectRoot, lintedRoots(context['manifest'])),
    }),
    ...findingsFrom(testRunFindings, context, { reportRoot, projectRoot, testRoots }),
  ];
}

function reportingOf(options: Options, module: unknown, preset: string): Options {
  const { modulePath, exceptions } = options;
  return {
    formatAdvice: options['formatAdvice'],
    conventions: options['conventions'],
    javaStyle: options['javaStyle'],
    classLimits: { thresholds: options['fileLimits'], exceptions, modulePath },
    testTimes: { limits: options['testSeconds'], baseline: options['baseline'], modulePath },
    featureLayout: { layout: options['featureLayout'], modulePath },
    testConsole: {
      allow: options['testConsoleAllow'],
      exceptions,
      modulePath,
      moduleRoot: fieldOf(module, 'dir'),
    },
    jacoco:
      options['quick'] === true || fieldOf(fieldOf(module, 'manifest'), 'testsFailed') === true
        ? undefined
        : callUntyped(readModuleJacoco, module, preset),
  };
}

function moduleContextFindings(projectRoot: string, module: unknown, all: ModuleRun): Findings {
  const { manifest, modules, options, ...run } = all;
  const preset = textOf(options['preset'] ?? 'java');
  const moduleManifest = fieldOf(module, 'manifest');
  const context: ModuleContext = {
    projectRoot,
    reactorRoot: options['reactorRoot'] ?? projectRoot,
    roots: projectRoots(projectRoot),
    reportRoot: textOf(fieldOf(module, 'reportRoot')),
    manifest: moduleManifest,
    module: { moduleDir: fieldOf(module, 'dir'), modulePath: options['modulePath'] },
    sourceRoots: listsOf(moduleManifest, 'sourceRoots'),
    lintedRoots: lintedRoots(moduleManifest),
    allSourceRoots: fieldOf(manifest, 'sourceRoots'),
    modules,
    ...run,
    kotlin: preset === 'kotlin' && fieldOf(moduleManifest, 'kotlin') === true,
    quick: options['quick'] === true,
    mainCheckstyle: callUntyped(readMainCheckstyle, projectRoot, module, preset),
    ...reportingOf(options, module, preset),
  };
  const findings = readModuleFindings(context, options['crapLimit']);
  return listOf(withoutMainMethodFindings(findings, sourceTextReader(projectRoot)));
}

function reportRun(projectRoot: string): ReportRun {
  return { kotlinBuild: buildViews(), foreignKeys: foreignKeyGate(projectRoot) };
}

function wideReport(projectRoot: string, run: ModuleRun, reportBase: string): JavaReadout {
  if (run.options['projectWide'] === false) {
    return { findings: [], imports: undefined };
  }
  const wide = callUntyped(projectWideReport, projectRoot, {
    projects: reportModuleProjects(run.modules, 'root'),
    mergedRoot: path.join(reportBase, 'project'),
    manifest: run.manifest,
    kotlin: run.options['preset'] === 'kotlin',
    policy: run.options,
  });
  const duplicates = callUntyped(readProjectDuplicateFindings, reportBase, {
    preset: textOf(run.options['preset'] ?? 'java'),
    projectRoot,
    skip: coveredByCpd(run.modules, projectRoot),
  });
  return {
    findings: [...listOf(duplicates), ...listOf(fieldOf(wide, 'findings'))],
    imports: fieldOf(wide, 'imports'),
  };
}

export function readJavaFindings(projectRoot: string, options: Options = {}): JavaReadout {
  const reportBase = textOf(options['reportBase']);
  const preset = textOf(options['preset'] ?? 'java');
  const report: unknown = options['report'] ?? readReportModules(reportBase, preset);
  const manifest = fieldOf(report, 'manifest');
  const modules = listOf(fieldOf(report, 'modules'));
  if (preset === 'kotlin' && options['requireKotlin'] !== false) {
    requireKotlinManifest(manifest);
  }
  const run = { manifest, modules, options, ...reportRun(projectRoot) };
  const moduleFindings = modules
    .filter((module) => isEmptyModule(projectRoot, module) !== true)
    .flatMap((module) =>
      listOf(withModuleIdentity(moduleContextFindings(projectRoot, module, run), module)),
    );
  const wide = wideReport(projectRoot, run, reportBase);
  const findings = applyRuleMessages(
    [
      ...moduleFindings,
      ...listOf(wide.findings),
      ...listOf(readInlineSuppressionFindings(projectRoot, lintedRoots(manifest))),
      ...springFindings(projectRoot, manifest, options),
    ],
    { preset, javaStyle: options['javaStyle'] },
  );
  const locate = modulesUnitLocator(projectRoot, modules, preset === 'kotlin');
  return {
    findings: callUntyped(withJavaCountRatchets, withoutExcludedFiles(findings, modules), locate),
    imports: wide.imports,
  };
}
