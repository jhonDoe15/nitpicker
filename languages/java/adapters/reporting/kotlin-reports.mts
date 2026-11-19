import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { createGeneratedFilter } from '../../ingest/kotlin-mutants/generated-filter.mts';
import { KOTLIN_REPORTS } from '../kotlin/report-names/kotlin-report-names.mts';
import { readKotlinClassLimitFindings } from '../kotlin/kotlin-class-limits.mts';
import { withDetektCountRatchets } from '../kotlin/detekt/detekt-counts.mts';
import { functionUnitLocator } from './function-locator.mts';
import { detektFindings, formatterFindings } from './kotlin-format-reports.mts';
import { kotlinFormatAdvice } from '../kotlin/style/kotlin-format-advice.mts';
import {
  readKotlinCrapFindings,
  readKotlinMetrics,
  readKotlinStructureFindings,
} from '../kotlin/kotlin-metrics.mts';
import { readCompilerFindings } from '../kotlin/rules/kotlin-compiler.mts';
import { applyKotlinRuleMessages } from '../kotlin/rules/kotlin-messages.mts';
import {
  readCatchLogFindings,
  readTestAssertionFindings,
} from '../kotlin/rules/kotlin-source-rules.mts';
import { readSuppressionFindings } from '../kotlin/rules/kotlin-suppressions.mts';
import { withFrameworkAllowances } from '../kotlin/scan/framework-allowances.mts';
import { withoutCoveredCasts } from '../kotlin/scan/casts/cast-precedence.mts';
import { readKotlinSourceFindings } from '../kotlin/scan/kotlin-scan.mts';
import {
  readKotlinFanOutFindings,
  readKotlinReviewFindings,
} from '../kotlin/review-rules/review-findings.mts';
import { withoutCoveredFindings } from '../kotlin/review-rules/review-finding.mts';
import { readKotlinNotes } from './kotlin-notes.mts';
import { withoutTransactionAwareCacheWrites } from '../spring/transactions/transaction-aware.mts';
import { springRoots } from '../spring/transactions/transaction-filters.mts';
import { withoutTransactionalCallers } from '../spring/transactions/transactional-callers.mts';
import { withoutSpringCoveredReads } from '../spring/configuration/covered-reads.mts';
import { callUntyped } from '../typed/java-values.mts';
import {
  fieldOf,
  listOf,
  messageOf,
  parseJson,
  textsOf,
} from '../../../../shared/values/readers.mts';

type KotlinContext = Readonly<Record<string, unknown>> & {
  readonly reportRoot: string;
  readonly projectRoot: string;
};
type Locate = (packageDirectory: string, fileName: string) => string | undefined;
type GeneratedFilter = (
  mutants: readonly object[],
) => (mutant: object, filePath: string | undefined) => unknown;
type KotlinFile = { readonly path: string; readonly packageName: string };

const DEFAULT_ADVICE: unknown = callUntyped(kotlinFormatAdvice, { ktfmtStyle: 'meta' }, {});
const PACKAGE_DECLARATION = /^\s*package\s+([\w.`]+)/m;

export function requireKotlinManifest(manifest: unknown): void {
  if (fieldOf(manifest, 'kotlin') !== true) {
    throw new Error(
      'The kotlin preset needs a project that applies the Kotlin plugin (org.jetbrains.kotlin.jvm, org.jetbrains.kotlin.multiplatform or org.jetbrains.kotlin.android for Gradle, kotlin-maven-plugin for Maven); this one does not',
    );
  }
}

export function jacocoSourceRoots({
  sourceRoots,
  manifest,
  kotlin,
}: {
  sourceRoots: readonly string[];
  manifest: unknown;
  kotlin: boolean;
}): readonly string[] {
  return kotlin
    ? [...new Set([...sourceRoots, ...textsOf(fieldOf(manifest, 'kotlinSourceRoots'))])]
    : sourceRoots;
}

export function sourceLocator(projectRoot: string, sourceRoots: readonly string[]): Locate {
  let kotlinFiles: KotlinFile[] | undefined;
  return (packageDirectory, fileName) => {
    const direct = sourceRoots
      .map((sourceRoot) => [sourceRoot, packageDirectory, fileName].filter(Boolean).join('/'))
      .find((candidate) => {
        const full = resolveInside(projectRoot, candidate);
        return full !== undefined && existsSync(full);
      });
    if (direct !== undefined || !fileName.endsWith('.kt')) {
      return direct;
    }
    kotlinFiles ??= declaredKotlinFiles(projectRoot, sourceRoots);
    const packageName = packageDirectory.replaceAll('/', '.');
    return kotlinFiles.find(
      (file) => file.packageName === packageName && file.path.endsWith(`/${fileName}`),
    )?.path;
  };
}

export function sourceFileOf(
  locate: Locate,
  className: string,
  fileName: string | undefined,
): string | undefined {
  const parts = className.split('.');
  const simple = (parts.pop() ?? '').split('$')[0] ?? '';
  const directory = parts.join('/');
  return fileName === undefined
    ? (locate(directory, `${simple}.java`) ?? locate(directory, `${simple}.kt`))
    : locate(directory, fileName);
}

function declaredKotlinFiles(projectRoot: string, sourceRoots: readonly string[]): KotlinFile[] {
  return sourceRoots.flatMap((sourceRoot) => {
    const directory = resolveInside(projectRoot, sourceRoot);
    if (directory === undefined || !existsSync(directory)) {
      return [];
    }
    return readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('.kt'))
      .map((entry) => {
        const relative = `${sourceRoot}/${entry.replaceAll('\\', '/')}`;
        const full = resolveInside(projectRoot, relative);
        return { path: relative, packageName: full === undefined ? '' : declaredPackage(full) };
      });
  });
}

function declaredPackage(file: string): string {
  return PACKAGE_DECLARATION.exec(readFileSync(file, 'utf8'))?.[1]?.replaceAll('`', '') ?? '';
}

const resolveInside: (root: string, relative: string) => string | undefined = untypedResolveInside;
const generatedFilter: (facts: unknown) => GeneratedFilter = createGeneratedFilter;

export function kotlinGeneratedFilter({ reportRoot }: { reportRoot: string }): GeneratedFilter {
  const name = KOTLIN_REPORTS.mutationFacts;
  const report = path.join(reportRoot, name);
  if (!existsSync(report)) {
    throw new Error(
      [
        `The Kotlin mutation filter needs ${name} in ${reportRoot}.`,
        'The kotlin-psi program writes it beside the facts report;',
        'a build tool that skips the program (no Kotlin files) must write {"files":[]} there.',
      ].join(' '),
    );
  }
  try {
    return generatedFilter(parseJson(readFileSync(report, 'utf8')));
  } catch (error) {
    throw new Error(
      `${name} in ${reportRoot} is unusable (${messageOf(error)}); run the kotlin-psi program again`,
      { cause: error },
    );
  }
}

function reviewViews(context: KotlinContext): Record<string, unknown> {
  const { reportRoot, projectRoot } = context;
  const assertionHelpers = fieldOf(context['conventions'], 'kotlin.assertionHelpers') ?? [];
  return {
    ...{
      reportRoot,
      projectRoot,
      manifest: context['manifest'],
      modules: context['modules'],
      foreignKeys: context['foreignKeys'],
    },
    buildViews: context['kotlinBuild'],
    assertionHelpers,
  };
}

function kotlinRoots(manifest: unknown): { testRoots: string[]; sourceRoots: string[] } {
  return {
    testRoots: textsOf(fieldOf(manifest, 'kotlinTestSourceRoots')),
    sourceRoots: textsOf(fieldOf(manifest, 'kotlinSourceRoots')),
  };
}

type RuleInputs = { readonly metrics: unknown; readonly views: unknown; readonly advice: unknown };

function kotlinRuleFindings(
  context: KotlinContext,
  { metrics, views, advice }: RuleInputs,
): unknown {
  const { reportRoot, projectRoot } = context;
  const manifest = context['manifest'];
  const fanOut = callUntyped(readKotlinFanOutFindings, views);
  const { testRoots, sourceRoots } = kotlinRoots(manifest);
  const runners = fieldOf(context['conventions'], 'kotlin.detachedWorkRunners') ?? [];
  return callUntyped(
    withDetektCountRatchets,
    callUntyped(
      applyKotlinRuleMessages,
      callUntyped(withoutCoveredCasts, [
        ...listOf(
          callUntyped(withFrameworkAllowances, detektFindings(reportRoot, advice), {
            projectRoot,
            spring: fieldOf(manifest, 'spring') === true,
            testRoots,
          }),
        ),
        ...listOf(callUntyped(readKotlinSourceFindings, projectRoot, manifest, runners)),
        ...listOf(fieldOf(fanOut, 'findings')),
        ...listOf(callUntyped(readCompilerFindings, reportRoot, sourceRoots, testRoots)),
      ]),
    ),
    fieldOf(metrics, 'detektCounts'),
    functionUnitLocator({ ...context, kotlin: true }),
  );
}

export function readKotlinFindings(context: KotlinContext, crapLimit: unknown): unknown {
  const { reportRoot, projectRoot } = context;
  const manifest = context['manifest'];
  const jacoco = context['jacoco'];
  const formatAdvice = context['formatAdvice'] ?? DEFAULT_ADVICE;
  const metrics = callUntyped(readKotlinMetrics, reportRoot);
  const views = reviewViews(context);
  const { testRoots, sourceRoots } = kotlinRoots(manifest);
  const ruleFindings = kotlinRuleFindings(context, { metrics, views, advice: formatAdvice });
  const findings = callUntyped(
    withoutCoveredFindings,
    callUntyped(withoutSpringCoveredReads, [
      ...listOf(ruleFindings),
      ...readKotlinNotes(reportRoot),
      ...listOf(callUntyped(readSuppressionFindings, projectRoot, { sourceRoots, testRoots })),
      ...listOf(callUntyped(readCatchLogFindings, projectRoot, { sourceRoots, testRoots })),
      ...listOf(
        callUntyped(readTestAssertionFindings, projectRoot, testRoots, views['assertionHelpers']),
      ),
      ...formatterFindings(reportRoot, fieldOf(manifest, 'kotlinFormatter'), formatAdvice),
      ...listOf(callUntyped(readKotlinReviewFindings, views)),
      ...listOf(callUntyped(readKotlinStructureFindings, metrics, projectRoot)),
      ...listOf(callUntyped(readKotlinClassLimitFindings, metrics, context['classLimits'])),
      ...(jacoco === undefined
        ? []
        : listOf(callUntyped(readKotlinCrapFindings, metrics, { projectRoot, jacoco, crapLimit }))),
    ]),
    context['classLimits'],
  );
  return withoutTransactionFindings(findings, {
    projectRoot,
    roots: callUntyped(springRoots, context),
  });
}

function withoutTransactionFindings(findings: unknown, options: Record<string, unknown>): unknown {
  return callUntyped(
    withoutTransactionalCallers,
    callUntyped(withoutTransactionAwareCacheWrites, findings, options),
    options,
  );
}

export { ktfmtMessage, ktlintAdvice } from './kotlin-format-reports.mts';
