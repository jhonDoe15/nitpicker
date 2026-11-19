import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sourceTextReader } from '../function-locator.mts';
import { dropEntityAssociations, dropInheritedVersions } from '../../jpa/jpa-source-filters.mts';
import {
  ingestSarif as untypedIngestSarif,
  prepareSarif as untypedPrepareSarif,
} from '../../../../../shared/ingest/sarif.mjs';
import { FIXED_SLEEP_RULE, withWaitAdvice } from '../../../messages/wait-advice.mts';
import { dropSleepsInFakes } from '../../../messages/latency-fakes.mts';
import { withFanOutDetails } from '../../../messages/fan-out/fan-out-details.mts';
import { withLoadEffectSubjects } from '../../../messages/load-effects.mts';
import {
  securitySubject,
  stableName,
  withoutDuplicateSites,
  withSecurityMessages,
} from '../../security/security-advice.mts';
import { withLockEvidence } from '../../../messages/locking/lock-evidence.mts';
import { withProjectTypeMocks } from '../../../messages/mocks/project-mocks.mts';
import { dropNetworkInIntegrationTests } from '../../../messages/isolation/unit-tests.mts';
import { withGeneratedMembers } from '../../../messages/generated-members/generated-members.mts';
import { dropComputedReads } from '../../spring/queries/persistent-reads.mts';
import {
  springRoots,
  withSpringTransactionFilters,
} from '../../spring/transactions/transaction-filters.mts';
import { withoutUnconstrainedBodies } from '../../spring/web/request-body-constraints.mts';
import { withCrossedFetches } from '../../jpa/fetches/fetch-filter.mts';
import { withUnindexedForeignKeys } from '../../jpa/foreign-keys/key-filter.mts';
import { withoutMysqlSequenceIds } from '../../jpa/sequence-ids.mts';
import { withoutSpringCoveredReads } from '../../spring/configuration/covered-reads.mts';
import { withPmdLevels } from './pmd-levels.mts';
import { withRenderedPlaceholders } from '../../../messages/pmd-placeholders/pmd-placeholders.mts';
import { withoutRuntimeCryptoKeys } from './crypto-keys/crypto-key-filter.mts';
import { pmdProcessingErrors } from './processing/pmd-processing-errors.mts';
import { withoutClassesWithoutSource } from './spotbugs-sources.mts';
import type { SarifLog, SarifResult } from '../../jpa/jpa-types.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../../typed/java-values.mts';
import {
  fieldOf,
  fieldsOf,
  listOf,
  optionalText,
  parseJson,
  textsOf,
  type Fields,
} from '../../../../../shared/values/readers.mts';

type SarifContext = Readonly<Record<string, unknown>> & {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly roots: readonly string[];
  readonly sourceRoots: readonly string[];
};
type IdentityKey = (result: SarifResult) => string | undefined;

const ingestSarif: (
  log: Fields,
  options: { readonly tool: string },
) => { readonly findings: JavaFinding[] } = untypedIngestSarif;
const prepareSarif: (
  log: SarifLog,
  options: {
    readonly roots: readonly string[];
    readonly sourceRoots: readonly string[];
    readonly projectRoot: string;
    readonly identityKey: IdentityKey;
  },
) => SarifLog = untypedPrepareSarif;

const LINE_NUMBER = /\bline \d+\b/g;
const PRINTED_PMD_RULES = new Map([['timeout-abandons-async-task', 'timeout-abandons-operation']]);
const ALIAS_RULE = 'ForwardingMethodAlias';
const RENAME_ALIAS_RULE = 'ForwardingMethodAliasRename';
const EMPTY_SARIF: SarifLog = { version: '2.1.0', runs: [] };

function isSarifLog(value: unknown): value is SarifLog {
  return typeof value === 'object' && value !== null;
}

export function readSarifReport(file: string): SarifLog {
  const text = readFileSync(file, 'utf8');
  const log = text.trim() === '' ? EMPTY_SARIF : parseJson(text);
  return isSarifLog(log) ? log : EMPTY_SARIF;
}

function withJpaFilters(
  findings: unknown,
  { projectRoot, sourceRoots, foreignKeys, sequenceIds }: Record<string, unknown>,
): unknown {
  const options = { projectRoot, sourceRoots };
  return callUntyped(
    withoutMysqlSequenceIds,
    callUntyped(withUnindexedForeignKeys, callUntyped(withCrossedFetches, findings, options), {
      ...options,
      checks: foreignKeys,
    }),
    { projectRoot, checks: sequenceIds },
  );
}

function printedRule(result: unknown): unknown {
  const printed = PRINTED_PMD_RULES.get(optionalText(fieldOf(result, 'ruleId')) ?? '');
  return printed === undefined ? result : { ...fieldsOf(result), ruleId: printed };
}

function withPrintedRules(report: Fields): Fields {
  return {
    ...report,
    runs: listOf(report['runs']).map((run) => ({
      ...fieldsOf(run),
      results: listOf(fieldOf(run, 'results')).map(printedRule),
    })),
  };
}

function preparedReport(
  log: SarifLog,
  { roots, sourceRoots, projectRoot }: SarifContext,
  identityKey: IdentityKey,
): SarifLog {
  return prepareSarif(log, { roots, sourceRoots, projectRoot, identityKey });
}

function withOneAliasRule(log: Fields): Fields {
  return {
    ...log,
    runs: listOf(log['runs']).map((run) => ({
      ...fieldsOf(run),
      results: listOf(fieldOf(run, 'results')).map((result) =>
        fieldOf(result, 'ruleId') === RENAME_ALIAS_RULE
          ? { ...fieldsOf(result), ruleId: ALIAS_RULE }
          : result,
      ),
    })),
  };
}

function pmdFindings(raw: SarifLog, context: SarifContext): unknown {
  const { projectRoot } = context;
  const sourceText = sourceTextReader(projectRoot);
  const prepared = preparedReport(raw, context, (result) =>
    optionalText(fieldOf(result.message, 'text'))?.replace(LINE_NUMBER, 'line'),
  );
  const pmd = withOneAliasRule(
    withLockEvidence(
      withPrintedRules(withLoadEffectSubjects(withPmdLevels(prepared), { projectRoot })),
      { projectRoot },
    ),
  );
  const constrained = callUntyped(
    withoutUnconstrainedBodies,
    withoutRuntimeCryptoKeys(
      findingsOf(
        callUntyped(withRenderedPlaceholders, ingestSarif(pmd, { tool: 'pmd' }).findings, {
          sourceText,
        }),
      ),
      { sourceText },
    ),
    { projectRoot, roots: callUntyped(springRoots, context), readText: sourceText },
  );
  return callUntyped(withoutSpringCoveredReads, constrained);
}

function withProjectFilters(findings: unknown, context: SarifContext): unknown {
  const { projectRoot } = context;
  const allSourceRoots = context['allSourceRoots'];
  const manifest = context['manifest'];
  const mainRoots = [
    ...textsOf(allSourceRoots),
    ...textsOf(fieldOf(manifest, 'kotlinSourceRoots')),
  ];
  const testRoots = [
    ...textsOf(fieldOf(manifest, 'testSourceRoots')),
    ...textsOf(fieldOf(manifest, 'kotlinTestSourceRoots')),
  ];
  const steps: readonly (readonly [unknown, unknown])[] = [
    [withSpringTransactionFilters, context],
    [dropComputedReads, { projectRoot, roots: callUntyped(springRoots, context) }],
    [withGeneratedMembers, { projectRoot }],
    [
      withJpaFilters,
      {
        projectRoot,
        sourceRoots: allSourceRoots,
        foreignKeys: context['foreignKeys'],
        sequenceIds: context['sequenceIds'],
      },
    ],
    [dropInheritedVersions, { projectRoot, sourceRoots: allSourceRoots }],
    [withProjectTypeMocks, { projectRoot, mainRoots }],
    [dropNetworkInIntegrationTests, { projectRoot, testRoots }],
    [dropSleepsInFakes, { rule: FIXED_SLEEP_RULE, projectRoot, mainRoots }],
    [withWaitAdvice, { manifest, projectRoot }],
    [withFanOutDetails, { projectRoot }],
  ];
  return steps.reduce((current, [step, options]) => callUntyped(step, current, options), findings);
}

export function sarifFindings(context: SarifContext): unknown[] {
  const { projectRoot } = context;
  const pmd = readSarifReport(path.join(context.reportRoot, 'pmd.sarif'));
  const spotbugs = preparedReport(
    readSarifReport(path.join(context.reportRoot, 'spotbugs.sarif')),
    context,
    (result) => securitySubject(result, spotbugsSubject(result)),
  );
  const spotbugsFilter = context['spotbugsFilter'];
  const withSources = withoutClassesWithoutSource(
    dropEntityAssociations(spotbugs, projectRoot),
    projectRoot,
  );
  const filtered: unknown =
    typeof spotbugsFilter === 'function' ? callUntyped(spotbugsFilter, withSources) : withSources;
  const secured = withSecurityMessages(
    withoutDuplicateSites(isSarifLog(filtered) ? filtered : EMPTY_SARIF, pmd),
  );
  return [
    ...listOf(withProjectFilters(pmdFindings(pmd, context), context)),
    ...pmdProcessingErrors(pmd, context),
    ...ingestSarif(fieldsOf(secured), { tool: 'spotbugs' }).findings,
  ];
}

function spotbugsSubject(result: SarifResult): string | undefined {
  const args = result.message?.arguments;
  const subject =
    Array.isArray(args) && args.length > 0
      ? args.join(' ')
      : optionalText(fieldOf(result.message, 'text'));
  return typeof subject === 'string' ? stableName(subject) : subject;
}
