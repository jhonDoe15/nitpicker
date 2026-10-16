import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ingestCheckstyle } from '../../ingest/formatting/checkstyle.mjs';
import { ingestArchunit } from '../../ingest/archunit.mjs';
import { DUPLICATES_REPORT, readDuplicateFindings } from '../metrics/java-duplicates.mjs';
import { coveredByCpd } from '../../guards/cpd-duplicates.mjs';
import { readKotlinDuplicateFindings } from '../kotlin/kotlin-duplicates.mjs';
import { readErrorProneFindings } from '../errorprone/java-errorprone.mjs';
import { dropEntityAssociations, dropInheritedVersions } from '../jpa/jpa-source-filters.mjs';
import {
  isEmptyModule,
  readMainCheckstyle,
  readModuleJacoco,
  readReportModules,
} from '../gradle-reports/report-modules.mjs';
import { readInlineSuppressionFindings } from '../suppressions/java-suppressions.mjs';
import { readCommentFindings } from '../comments/java-comments.mjs';
import { readSpringConfigFindings } from '../spring/java-spring.mjs';
import { readGuardFindings } from '../../guards/index.mjs';
import { readJavaStructureFindings } from '../metrics/java-structure.mjs';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { ingestSarif, prepareSarif, projectRelative } from '../../ingest/sarif.mjs';
import { projectWideFindings } from '../../builds/project-wide.mjs';
import { applyRuleMessages } from '../../messages/rule-messages.mjs';
import { readKotlinFindings, requireKotlinManifest, sourceLocator } from './kotlin-reports.mjs';
import { readTestFailures, sourceFileOf, testResultFindings } from './outcomes/test-results.mjs';

const LINE_NUMBER = /\bline \d+\b/g;
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
      { preset },
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
      allSourceRoots: manifest.sourceRoots,
      kotlinPreset,
      kotlin: kotlinPreset && module.manifest.kotlin === true,
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
    ...readErrorProneFindings({
      ...context,
      lintedRoots: lintedRoots(context.manifest),
      kotlin: context.kotlinPreset,
    }),
    ...formatFindings(context),
    ...checkstyleFindings(context),
    ...archunitFindings(context),
    ...readJavaStructureFindings(reportRoot, projectRoot),
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

function preparedReport(file, { reportRoot, roots, sourceRoots, projectRoot }, identityKey) {
  return prepareSarif(JSON.parse(readFileSync(path.join(reportRoot, file), 'utf8')), {
    roots,
    sourceRoots,
    projectRoot,
    identityKey,
  });
}

function sarifFindings(context) {
  const { allSourceRoots, projectRoot } = context;
  const pmd = preparedReport('pmd.sarif', context, (result) =>
    result.message?.text?.replace(LINE_NUMBER, 'line'),
  );
  const spotbugs = preparedReport('spotbugs.sarif', context, spotbugsSubject);
  return [
    ...dropInheritedVersions(ingestSarif(pmd, { tool: 'pmd' }).findings, {
      projectRoot,
      sourceRoots: allSourceRoots,
    }),
    ...ingestSarif(dropEntityAssociations(spotbugs, projectRoot), { tool: 'spotbugs' }).findings,
  ];
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

function spotbugsSubject(result) {
  const args = result.message?.arguments;
  return Array.isArray(args) && args.length > 0 ? args.join(' ') : result.message?.text;
}
