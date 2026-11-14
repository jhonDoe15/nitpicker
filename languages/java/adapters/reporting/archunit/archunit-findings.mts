import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ingestArchunit } from '../../../ingest/archunit.mjs';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../../builds/module-path.mjs';
import { readSpringArchFindings } from '../../spring-arch/spring-arch.mjs';
import { featureFaceMatcher } from '../../spring-arch/contract-types.mjs';
import { sourceFileOf, sourceLocator } from '../kotlin-reports.mjs';
import { callUntyped } from '../../typed/java-values.mts';
import { fieldOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';

type ReportContext = Readonly<Record<string, unknown>> & {
  readonly projectRoot: string;
  readonly reportRoot: string;
};

function classLocator(context: ReportContext): unknown {
  const { manifest } = context;
  return callUntyped(sourceLocator, context.projectRoot, [
    ...textsOf(context['sourceRoots']),
    ...textsOf(fieldOf(manifest, 'testSourceRoots')),
    ...textsOf(fieldOf(manifest, 'kotlinSourceRoots')),
    ...textsOf(fieldOf(manifest, 'kotlinTestSourceRoots')),
  ]);
}

function pathResolver(locate: unknown): (className: unknown, fileName: unknown) => unknown {
  return (className, fileName) => callUntyped(sourceFileOf, locate, className, fileName);
}

export function springArchFindings(context: ReportContext): unknown {
  const { manifest, classLimits } = context;
  if (fieldOf(manifest, 'springArch') !== true) {
    return [];
  }
  const matches = callUntyped(exceptionMatcher, fieldOf(classLimits, 'exceptions') ?? []);
  const modulePath = fieldOf(classLimits, 'modulePath');
  return callUntyped(readSpringArchFindings, context.reportRoot, {
    resolvePath: pathResolver(classLocator(context)),
    spring: fieldOf(manifest, 'spring') === true,
    isFeatureFace: callUntyped(featureFaceMatcher, context['featureLayout']),
    isExcepted: (rule: unknown, file: unknown) =>
      file !== undefined && callUntyped(matches, rule, inModule(modulePath, file)) === true,
  });
}

function archunitReportText(archunitRoot: string, name: string): string {
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

export function archunitFindings(context: ReportContext): unknown[] {
  const archunitRoot = path.join(context.reportRoot, 'archunit');
  const archunitReports = existsSync(archunitRoot)
    ? readdirSync(archunitRoot)
        .filter((name) => name.endsWith('.xml'))
        .sort()
    : [];
  const resolvePath = pathResolver(classLocator(context));
  return archunitReports.flatMap((name) =>
    listOf(
      fieldOf(
        callUntyped(ingestArchunit, archunitReportText(archunitRoot, name), { resolvePath }),
        'findings',
      ),
    ),
  );
}
