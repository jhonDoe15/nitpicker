import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ingestArchunit } from '../../../ingest/archunit.mjs';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../../builds/module-path.mjs';
import { readSpringArchFindings } from '../../spring-arch/spring-arch.mjs';
import { featureFaceMatcher } from '../../spring-arch/contract-types.mjs';
import { sourceFileOf, sourceLocator } from '../kotlin-reports.mjs';

function classLocator({ projectRoot, sourceRoots, manifest }) {
  return sourceLocator(projectRoot, [
    ...sourceRoots,
    ...(manifest.testSourceRoots ?? []),
    ...(manifest.kotlinSourceRoots ?? []),
    ...(manifest.kotlinTestSourceRoots ?? []),
  ]);
}

export function springArchFindings(context) {
  if (context.manifest.springArch !== true) {
    return [];
  }
  const locate = classLocator(context);
  const { exceptions = [], modulePath } = context.classLimits;
  const matches = exceptionMatcher(exceptions);
  return readSpringArchFindings(context.reportRoot, {
    resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
    spring: context.manifest.spring === true,
    isFeatureFace: featureFaceMatcher(context.featureLayout),
    isExcepted: (rule, file) => file !== undefined && matches(rule, inModule(modulePath, file)),
  });
}

function archunitReportText(archunitRoot, name) {
  const resolved = path.resolve(archunitRoot, name);
  if (!resolved.startsWith(path.resolve(archunitRoot) + path.sep)) {
    throw new Error(`ArchUnit report ${name} is outside ${archunitRoot}.`);
  }
  const real = realpathSync(resolved);
  if (!real.startsWith(realpathSync(archunitRoot) + path.sep)) {
    throw new Error(`ArchUnit report ${name} is outside ${archunitRoot}.`);
  }
  return readFileSync(real, 'utf8');
}

export function archunitFindings({ reportRoot, projectRoot, sourceRoots, manifest }) {
  const archunitRoot = path.join(reportRoot, 'archunit');
  const archunitReports = existsSync(archunitRoot)
    ? readdirSync(archunitRoot)
        .filter((name) => name.endsWith('.xml'))
        .sort()
    : [];
  const locate = classLocator({ projectRoot, sourceRoots, manifest });
  return archunitReports.flatMap(
    (name) =>
      ingestArchunit(archunitReportText(archunitRoot, name), {
        resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
      }).findings,
  );
}
