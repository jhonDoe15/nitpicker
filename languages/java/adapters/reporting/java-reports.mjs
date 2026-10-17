import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ingestCheckstyle } from '../../ingest/formatting/checkstyle.mjs';
import { ingestArchunit } from '../../ingest/archunit.mjs';
import { DUPLICATES_REPORT, readDuplicateFindings } from '../metrics/java-duplicates.mjs';
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
import { readJavaStructureFindings } from '../metrics/java-structure.mjs';
import { readClassLimitFindings } from '../size/class-limits.mjs';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { projectRelative } from '../../ingest/sarif.mjs';
import { sarifFindings } from './java-sarif-reports.mjs';
import { projectWideFindings } from '../../builds/project-wide.mjs';
import { applyRuleMessages } from '../../messages/rule-messages.mjs';
import { readKotlinFindings, requireKotlinManifest, sourceLocator } from './kotlin-reports.mjs';
import { readTestFailures, sourceFileOf, testResultFindings } from './outcomes/test-results.mjs';
import { skippedToolFindings, withoutCheckstyleParseSkips } from './outcomes/skipped-tools.mjs';

const CHECKSTYLE_SOURCE_SET_REPORT = /^checkstyle-.+\.xml$/u;
const MODULE_IDENTITY_SEPARATOR = '@';
const ROOT_MODULE = 'root';
const PROJECT_REPORTS = 'project';

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
        moduleContextFindings(projectRoot, module, { manifest, options, kotlinPreset }),
        module,
      ),
    );
  return {
    findings: applyRuleMessages(
      [
        ...moduleFindings,
        ...readDuplicateFindings(reportBase, DUPLICATES_REPORT, {
          skip: coveredByCpd(modules, projectRoot),
        }),
        ...(kotlinPreset ? readKotlinDuplicateFindings(reportBase) : []),
        ...(projectWide
          ? projectWideFindings(projectRoot, {
              projects: modules.map((module) => ({
                reportRoot: module.reportRoot,
                qualifier: module.key === ROOT_MODULE ? '' : module.dir,
                sourceRoots: module.manifest.sourceRoots ?? [],
              })),
              mergedRoot: path.join(reportBase, PROJECT_REPORTS),
              manifest,
              kotlin: kotlinPreset,
              policy: options,
            })
          : []),
        ...readInlineSuppressionFindings(projectRoot, lintedRoots(manifest)),
        ...readCommentFindings(projectRoot, lintedRoots(manifest)),
        ...springFindings(projectRoot, manifest),
      ],
      { preset, testRoots: manifest.testSourceRoots ?? [] },
    ),
  };
}

function moduleContextFindings(projectRoot, module, { manifest, options, kotlinPreset }) {
  const preset = options.preset ?? 'java';
  const testReport = readTestFailures(module.reportRoot);
  return readModuleFindings(
    {
      projectRoot,
      roots: projectRoots(projectRoot),
      reportRoot: module.reportRoot,
      manifest: module.manifest,
      module: { moduleDir: module.dir, modulePath: options.modulePath },
      sourceRoots: module.manifest.sourceRoots ?? [],
      lintedRoots: lintedRoots(module.manifest),
      allSourceRoots: manifest.sourceRoots,
      kotlinPreset,
      kotlin: kotlinPreset && module.manifest.kotlin === true,
      javaStyle: options.javaStyle,
      classLimits: {
        thresholds: options.fileLimits,
        exceptions: options.exceptions,
        modulePath: options.modulePath,
      },
      testReport,
      testScope: {
        snapshot: options.baseline?.snapshot,
        moduleLabel: options.modulePath || module.dir,
      },
      jacoco: testReport.skipped.some(({ tool }) => tool === 'jacoco')
        ? undefined
        : readModuleJacoco(module, preset),
      mainCheckstyle: readMainCheckstyle(projectRoot, module, preset),
      testTimes: {
        limits: options.testSeconds,
        baseline: options.baseline,
        modulePath: options.modulePath,
      },
    },
    options.crapLimit,
  );
}

function readModuleFindings(context, crapLimit) {
  const { reportRoot, projectRoot, kotlin } = context;
  return [
    ...sarifFindings(context),
    ...readErrorProneFindings({ ...context, kotlin: context.kotlinPreset }),
    ...formatFindings(context),
    ...skippedToolFindings(context),
    ...withoutCheckstyleParseSkips(checkstyleFindings(context), context.testScope),
    ...archunitFindings(context),
    ...readJavaStructureFindings(reportRoot, projectRoot),
    ...readClassLimitFindings(reportRoot, context.classLimits),
    ...(kotlin ? readKotlinFindings(context, crapLimit) : []),
    ...readGuardFindings({
      ...context,
      locate: sourceLocator(projectRoot, lintedRoots(context.manifest)),
    }),
    ...testResultFindings(context, crapLimit),
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

function springFindings(projectRoot, manifest) {
  return manifest.spring === true
    ? readSpringConfigFindings(projectRoot, {
        sourceRoots: manifest.sourceRoots,
        resourceRoots: manifest.resourceRoots,
      })
    : [];
}

function formatFindings({ reportRoot, roots, javaStyle }) {
  const formatLines = readFileSync(path.join(reportRoot, 'format.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => projectRelative(line.trim(), roots) ?? line);
  return ingestFormatCheck(formatLines.join('\n'), {
    tool: 'google-java-format',
    message: `File is not formatted with google-java-format${javaStyle === 'aosp' ? ' --aosp' : ''}`,
  }).findings;
}

function checkstyleFindings({ reportRoot, roots, projectRoot, mainCheckstyle }) {
  const sourceSetReports = readdirSync(reportRoot)
    .filter((name) => CHECKSTYLE_SOURCE_SET_REPORT.test(name))
    .sort()
    .map((name) => readFileSync(path.join(reportRoot, name), 'utf8'));
  return [mainCheckstyle, ...sourceSetReports]
    .filter(Boolean)
    .flatMap((checkstyle) =>
      roots.flatMap((root) =>
        ingestCheckstyle(checkstyle, { root }).findings.filter((finding) =>
          existsSync(path.join(projectRoot, finding.path)),
        ),
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

function projectRoots(projectRoot) {
  const roots = new Set([path.resolve(projectRoot)]);
  roots.add(realpathSync(projectRoot));
  return [...roots];
}
