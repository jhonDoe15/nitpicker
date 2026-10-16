import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ingestCheckstyle } from '../../ingest/formatting/checkstyle.mjs';
import { ingestArchunit } from '../../ingest/archunit.mjs';
import { ingestCrap } from '../../ingest/crap.mjs';
import { readDuplicateFindings } from '../metrics/java-duplicates.mjs';
import { readKotlinDuplicateFindings } from '../kotlin/kotlin-duplicates.mjs';
import {
  dropEntityAssociations,
  dropInheritedVersions,
  withExposureAdvice,
} from '../jpa/jpa-source-filters.mjs';
import {
  isEmptyModule,
  readMainCheckstyle,
  readModuleJacoco,
  readReportModules,
} from '../gradle-reports/report-modules.mjs';
import { readErrorProneFindings } from '../errorprone/java-errorprone.mjs';
import { readInlineSuppressionFindings } from '../suppressions/java-suppressions.mjs';
import { readSpringConfigFindings } from '../spring/java-spring.mjs';
import { methodText, readJavaStructureFindings } from '../metrics/java-structure.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { ingestFormatCheck } from '../../ingest/formatting/format-check.mjs';
import { readSlowTestFindings } from '../test-times/slow-tests.mjs';
import { ingestJacoco } from '../../ingest/coverage-reports/jacoco.mjs';
import { ingestPit } from '../../ingest/pit.mjs';
import { ingestJacocoBranches } from '../../ingest/coverage-reports/jacoco-branches.mjs';
import { ingestSarif, prepareSarif, projectRelative } from '../../ingest/sarif.mjs';
import { projectWideFindings } from '../../builds/project-wide.mjs';
import { applyRuleMessages } from '../../messages/rule-messages.mjs';
import {
  jacocoSourceRoots,
  readKotlinFindings,
  reportOnlyKotlinMutants,
  requireKotlinManifest,
  sourceLocator,
} from './kotlin-reports.mjs';

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
      withModuleIdentity(moduleContextFindings(projectRoot, module, { manifest, options }), module),
    );
  return {
    findings: applyRuleMessages(
      [
        ...moduleFindings,
        ...readDuplicateFindings(reportBase),
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
        ...springFindings(projectRoot, manifest, options),
      ],
      { preset },
    ),
  };
}

function moduleContextFindings(projectRoot, module, { manifest, options }) {
  const preset = options.preset ?? 'java';
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
      jacoco: readModuleJacoco(module, preset),
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
  const { reportRoot, projectRoot, kotlin, jacoco } = context;
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
    ...branchFindings(context, jacoco),
    ...(kotlin ? readKotlinFindings(context, crapLimit) : []),
    ...readSlowTestFindings({
      reportRoot,
      projectRoot,
      testRoots: [
        ...(context.manifest.testSourceRoots ?? []),
        ...(context.manifest.kotlinTestSourceRoots ?? []),
      ],
      ...context.testTimes,
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
        sourceRoots: manifest.sourceRoots,
        resourceRoots: manifest.resourceRoots,
        testSourceRoots: manifest.testSourceRoots,
        baselineRoot: baselineRootOf(options),
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
    ...ingestSarif(dropEntityAssociations(spotbugs, projectRoot), {
      tool: 'spotbugs',
    }).findings.map(withExposureAdvice),
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
