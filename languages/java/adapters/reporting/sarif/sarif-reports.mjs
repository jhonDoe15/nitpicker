import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  dropEntityAssociations,
  dropInheritedVersions,
  withExposureAdvice,
} from '../../jpa/jpa-source-filters.mjs';
import { ingestSarif, prepareSarif } from '../../../../../shared/ingest/sarif.mjs';
import { FIXED_SLEEP_RULE, withWaitAdvice } from '../../../messages/wait-advice.mjs';
import { dropSleepsInFakes } from '../../../messages/latency-fakes.mjs';
import { withLoadEffectSubjects } from '../../../messages/load-effects.mjs';

const LINE_NUMBER = /\bline \d+\b/g;
const PRINTED_PMD_RULES = new Map([['timeout-abandons-async-task', 'timeout-abandons-operation']]);
const EMPTY_SARIF = { version: '2.1.0', runs: [] };

export function readSarifReport(file) {
  const text = readFileSync(file, 'utf8');
  return text.trim() === '' ? EMPTY_SARIF : JSON.parse(text);
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

function preparedReport(file, { reportRoot, roots, sourceRoots, projectRoot }, identityKey) {
  return prepareSarif(readSarifReport(path.join(reportRoot, file)), {
    roots,
    sourceRoots,
    projectRoot,
    identityKey,
  });
}

export function sarifFindings(context) {
  const { allSourceRoots, projectRoot } = context;
  const pmd = withPrintedRules(
    withLoadEffectSubjects(
      preparedReport('pmd.sarif', context, (result) =>
        result.message?.text?.replace(LINE_NUMBER, 'line'),
      ),
      { projectRoot },
    ),
  );
  const spotbugs = preparedReport('spotbugs.sarif', context, spotbugsSubject);
  return [
    ...withWaitAdvice(
      dropSleepsInFakes(
        dropInheritedVersions(ingestSarif(pmd, { tool: 'pmd' }).findings, {
          projectRoot,
          sourceRoots: allSourceRoots,
        }),
        {
          rule: FIXED_SLEEP_RULE,
          projectRoot,
          mainRoots: [...(allSourceRoots ?? []), ...(context.manifest?.kotlinSourceRoots ?? [])],
        },
      ),
      { manifest: context.manifest, projectRoot },
    ),
    ...ingestSarif(dropEntityAssociations(spotbugs, projectRoot), {
      tool: 'spotbugs',
    }).findings.map(withExposureAdvice),
  ];
}

function spotbugsSubject(result) {
  const args = result.message?.arguments;
  return Array.isArray(args) && args.length > 0 ? args.join(' ') : result.message?.text;
}
