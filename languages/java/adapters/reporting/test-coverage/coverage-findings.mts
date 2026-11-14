import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestCrap } from '../../../ingest/crap.mjs';
import { ingestJacoco } from '../../../ingest/coverage-reports/jacoco.mts';
import { ingestPit } from '../../../ingest/pit.mts';
import { ingestJacocoBranches } from '../../../ingest/coverage-reports/jacoco-branches.mts';
import { pitFailureFindings } from '../../../builds/pit-failure/pit-failure.mjs';
import { pitSkippedFindings } from '../../../builds/pit-failure/pit-skipped.mjs';
import { firstProjectFile } from '../../../../../shared/conventions/read-inside.mjs';
import { archunitFindings, springArchFindings } from '../archunit/archunit-findings.mts';
import { javaMethodText } from '../../metrics/java-structure.mjs';
import {
  declarationUnits,
  functionLocator,
  sourceTextReader,
  structureFunctions,
} from '../function-locator.mjs';
import {
  jacocoSourceRoots,
  kotlinGeneratedFilter,
  sourceFileOf,
  sourceLocator,
} from '../kotlin-reports.mjs';
import { callUntyped } from '../../typed/java-values.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../../../shared/values/readers.mts';

export type Findings = readonly unknown[];
export type ModuleContext = Readonly<Record<string, unknown>> & {
  projectRoot: string;
  reportRoot: string;
  kotlin: boolean;
  quick: boolean;
};

function inProject(projectRoot: string, file: unknown): boolean {
  return firstProjectFile(projectRoot, [textOf(file)]) !== undefined;
}

export function findingsFrom(read: unknown, ...args: readonly unknown[]): Findings {
  return listOf(callUntyped(read, ...args));
}

export function ifTested(jacoco: unknown, build: (report: unknown) => Findings): Findings {
  return jacoco === undefined ? [] : build(jacoco);
}

function jacocoFindings(context: ModuleContext, jacoco: unknown): Findings {
  return textsOf(callUntyped(jacocoSourceRoots, context)).flatMap((sourceRoot) =>
    listOf(fieldOf(callUntyped(ingestJacoco, jacoco, { sourceRoot }), 'findings')).filter(
      (finding) => inProject(context.projectRoot, fieldOf(finding, 'path')),
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
      inProject(projectRoot, fieldOf(entry, 'file'))
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
  if (fieldOf(context['manifest'], 'testsFailed') === true) {
    return [];
  }
  const moduleDir = fieldOf(context['module'], 'moduleDir');
  const failures = findingsFrom(pitFailureFindings, reportRoot, moduleDir);
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
  return [
    ...listOf(fieldOf(pit, 'findings')),
    ...findingsFrom(pitSkippedFindings, reportRoot, moduleDir),
  ];
}

export function branchFindings(context: ModuleContext, jacoco: unknown): Findings {
  const branches = callUntyped(ingestJacocoBranches, jacoco, {
    functions: callUntyped(structureFunctions, context),
    units: declarationUnits,
    locate: jacocoLocator(context),
    sourceText: sourceTextReader(context.projectRoot),
  });
  return listOf(fieldOf(branches, 'findings'));
}

export function coverageFindings(context: ModuleContext, crapLimit: unknown): Findings {
  return [
    ...ifTested(context['jacoco'], (report) => jacocoFindings(context, report)),
    ...findingsFrom(archunitFindings, context),
    ...findingsFrom(springArchFindings, context),
    ...ifTested(context['jacoco'], (report) => crapFindings(context, report, crapLimit)),
    ...(context.quick ? [] : pitFindings(context)),
  ];
}
