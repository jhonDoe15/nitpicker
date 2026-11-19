import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sourceTextReader } from '../function-locator.mjs';
import { dropEntityAssociations, dropInheritedVersions } from '../../jpa/jpa-source-filters.mjs';
import { ingestSarif, prepareSarif } from '../../../../../shared/ingest/sarif.mjs';
import { FIXED_SLEEP_RULE, withWaitAdvice } from '../../../messages/wait-advice.mjs';
import { dropSleepsInFakes } from '../../../messages/latency-fakes.mjs';
import { withFanOutDetails } from '../../../messages/fan-out/fan-out-details.mjs';
import { withLoadEffectSubjects } from '../../../messages/load-effects.mjs';
import {
  securitySubject,
  stableName,
  withoutDuplicateSites,
  withSecurityMessages,
} from '../../security/security-advice.mjs';
import { withLockEvidence } from '../../../messages/locking/lock-evidence.mjs';
import { withProjectTypeMocks } from '../../../messages/mocks/project-mocks.mjs';
import { dropNetworkInIntegrationTests } from '../../../messages/isolation/unit-tests.mjs';
import { withGeneratedMembers } from '../../../messages/generated-members/generated-members.mjs';
import { dropComputedReads } from '../../spring/queries/persistent-reads.mjs';
import {
  springRoots,
  withSpringTransactionFilters,
} from '../../spring/transactions/transaction-filters.mjs';
import { withoutUnconstrainedBodies } from '../../spring/web/request-body-constraints.mjs';
import { withCrossedFetches } from '../../jpa/fetches/fetch-filter.mjs';
import { withUnindexedForeignKeys } from '../../jpa/foreign-keys/key-filter.mjs';
import { withoutMysqlSequenceIds } from '../../jpa/sequence-ids.mjs';
import { withoutSpringCoveredReads } from '../../spring/configuration/covered-reads.mjs';
import { withPmdLevels } from './pmd-levels.mjs';
import { withRenderedPlaceholders } from '../../../messages/pmd-placeholders/pmd-placeholders.mjs';
import { withoutRuntimeCryptoKeys } from './crypto-keys/crypto-key-filter.mjs';
import { pmdProcessingErrors } from './processing/pmd-processing-errors.mjs';
import { pmdLogRuleCrashes, pmdLoggedCrashFiles } from './processing/pmd-rule-crashes.mjs';
import { withoutLineReferences } from '../../../../../shared/ingest/line-references.mjs';
import { withoutClassesWithoutSource } from './spotbugs-sources.mjs';

const PRINTED_PMD_RULES = new Map([['timeout-abandons-async-task', 'timeout-abandons-operation']]);
const ALIAS_RULE = 'ForwardingMethodAlias';
const RENAME_ALIAS_RULE = 'ForwardingMethodAliasRename';
const EMPTY_SARIF = { version: '2.1.0', runs: [] };

export function readSarifReport(file) {
  const text = readFileSync(file, 'utf8');
  return text.trim() === '' ? EMPTY_SARIF : JSON.parse(text);
}

function withJpaFilters(findings, { projectRoot, sourceRoots, foreignKeys, sequenceIds }) {
  const options = { projectRoot, sourceRoots };
  return withoutMysqlSequenceIds(
    withUnindexedForeignKeys(withCrossedFetches(findings, options), {
      ...options,
      checks: foreignKeys,
    }),
    { projectRoot, checks: sequenceIds },
  );
}

function printedRule(result) {
  const printed = PRINTED_PMD_RULES.get(result.ruleId);
  return printed === undefined ? result : { ...result, ruleId: printed };
}

function withPrintedRules(report) {
  return {
    ...report,
    runs: report.runs.map((run) => ({ ...run, results: (run.results ?? []).map(printedRule) })),
  };
}

function preparedReport(log, { roots, sourceRoots, projectRoot }, identityKey) {
  return prepareSarif(log, { roots, sourceRoots, projectRoot, identityKey });
}

function withOneAliasRule(log) {
  return {
    ...log,
    runs: log.runs.map((run) => ({
      ...run,
      results: run.results.map((result) =>
        result.ruleId === RENAME_ALIAS_RULE ? { ...result, ruleId: ALIAS_RULE } : result,
      ),
    })),
  };
}

function pmdFindings(raw, context) {
  const { projectRoot } = context;
  const sourceText = sourceTextReader(projectRoot);
  const prepared = preparedReport(raw, context, (result) =>
    typeof result.message?.text === 'string'
      ? withoutLineReferences(result.message.text)
      : undefined,
  );
  const pmd = withOneAliasRule(
    withLockEvidence(
      withPrintedRules(withLoadEffectSubjects(withPmdLevels(prepared), { projectRoot })),
      { projectRoot },
    ),
  );
  const constrained = withoutUnconstrainedBodies(
    withoutRuntimeCryptoKeys(
      withRenderedPlaceholders(ingestSarif(pmd, { tool: 'pmd' }).findings, { sourceText }),
      { sourceText },
    ),
    { projectRoot, roots: springRoots(context), readText: sourceText },
  );
  return withoutSpringCoveredReads(constrained);
}

function withProjectFilters(findings, context) {
  const { allSourceRoots, projectRoot } = context;
  const mainRoots = [...(allSourceRoots ?? []), ...(context.manifest?.kotlinSourceRoots ?? [])];
  const testRoots = [
    ...(context.manifest?.testSourceRoots ?? []),
    ...(context.manifest?.kotlinTestSourceRoots ?? []),
  ];
  const ownFindings = dropNetworkInIntegrationTests(
    withProjectTypeMocks(
      dropInheritedVersions(
        withJpaFilters(
          withGeneratedMembers(
            dropComputedReads(withSpringTransactionFilters(findings, context), {
              projectRoot,
              roots: springRoots(context),
            }),
            { projectRoot },
          ),
          {
            projectRoot,
            sourceRoots: allSourceRoots,
            foreignKeys: context.foreignKeys,
            sequenceIds: context.sequenceIds,
          },
        ),
        { projectRoot, sourceRoots: allSourceRoots },
      ),
      { projectRoot, mainRoots },
    ),
    { projectRoot, testRoots },
  );
  return withFanOutDetails(
    withWaitAdvice(
      dropSleepsInFakes(ownFindings, { rule: FIXED_SLEEP_RULE, projectRoot, mainRoots }),
      { manifest: context.manifest, projectRoot },
    ),
    { projectRoot },
  );
}

export function sarifFindings(context) {
  const { projectRoot } = context;
  const pmd = readSarifReport(path.join(context.reportRoot, 'pmd.sarif'));
  const spotbugs = preparedReport(
    readSarifReport(path.join(context.reportRoot, 'spotbugs.sarif')),
    context,
    (result) => securitySubject(result, spotbugsSubject(result)),
  );
  return [
    ...withProjectFilters(pmdFindings(pmd, context), context),
    ...pmdProcessingErrors(pmd, {
      ...context,
      loggedCrashFiles: pmdLoggedCrashFiles(context.reportRoot, projectRoot),
    }),
    ...pmdLogRuleCrashes(context.reportRoot, projectRoot),
    ...ingestSarif(
      withSecurityMessages(
        withoutDuplicateSites(
          (context.spotbugsFilter ?? ((log) => log))(
            withoutClassesWithoutSource(dropEntityAssociations(spotbugs, projectRoot), projectRoot),
          ),
          pmd,
        ),
      ),
      { tool: 'spotbugs' },
    ).findings,
  ];
}

function spotbugsSubject(result) {
  const args = result.message?.arguments;
  const subject = Array.isArray(args) && args.length > 0 ? args.join(' ') : result.message?.text;
  return typeof subject === 'string' ? stableName(subject) : subject;
}
