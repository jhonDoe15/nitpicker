import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestFormatCheck as untypedIngestFormatCheck } from '../../../../shared/ingest/format-check.mjs';
import { ingestSarif as untypedIngestSarif } from '../../../../shared/ingest/sarif.mjs';
import { ONE_WAY_RULE_IDS } from '../kotlin/rules/kotlin-rules.mts';
import { appendSentence as untypedAppendSentence } from '../../../../shared/messages/exception-sentence.mjs';
import { readSarifReport } from './sarif/sarif-reports.mts';
import type { SarifLog } from '../jpa/jpa-types.mts';
import type { JavaFinding } from '../typed/java-values.mts';
import { fieldOf, optionalText, textOf } from '../../../../shared/values/readers.mts';

const ingestSarif: (
  log: SarifLog,
  options: { readonly tool: string },
) => { readonly findings: JavaFinding[] } = untypedIngestSarif;
const ingestFormatCheck: (
  text: string,
  options: { readonly tool: string; readonly message: string },
) => { readonly findings: JavaFinding[] } = untypedIngestFormatCheck;
const appendSentence: (message: string, sentence: string) => string = untypedAppendSentence;

const DETEKT_TOOL = 'detekt';
const DETEKT_REPORT = 'detekt.sarif';
const KTLINT = 'ktlint';
const KTFMT = 'ktfmt';
const KTLINT_REPORT = 'ktlint.sarif';
const KTFMT_REPORT = 'ktfmt.txt';
const KTLINT_PREFIX = 'ktlint.';
const NOT_YOUR_FORMATTER = 'Not your formatter: set kotlin.formatter';

function subjectOf(text: string): string {
  return text.replaceAll(/\b\d+\b/g, '#');
}

function identifiedBySubject(log: SarifLog): SarifLog {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).map((result) => ({
        ...result,
        partialFingerprints: {
          'nitpicker/subject': subjectOf(textOf(fieldOf(result.message, 'text'))),
        },
      })),
    })),
  };
}

function readSarif(reportRoot: string, file: string): SarifLog {
  return identifiedBySubject(readSarifReport(path.join(reportRoot, file)));
}

function withProjectConfigRoute(finding: JavaFinding, advice: unknown): JavaFinding {
  const detekt = optionalText(fieldOf(advice, 'detekt'));
  return detekt === undefined || ONE_WAY_RULE_IDS.includes(finding.rule)
    ? finding
    : { ...finding, message: appendSentence(finding.message ?? '', detekt) };
}

export function detektFindings(reportRoot: string, advice: unknown): JavaFinding[] {
  return ingestSarif(readSarif(reportRoot, DETEKT_REPORT), { tool: DETEKT_TOOL }).findings.map(
    (finding) => withProjectConfigRoute(finding, advice),
  );
}

function ktlintSwitch(ruleId: string): string {
  return `ktlint_${ruleId.replace(':', '_')}`;
}

export function ktlintAdvice(advice: unknown, ruleId: string): string {
  const ktlint = fieldOf(advice, KTLINT);
  const text: unknown =
    typeof ktlint === 'function'
      ? Reflect.apply(ktlint, advice, [ktlintSwitch(ruleId)])
      : undefined;
  return `${textOf(text)} ${NOT_YOUR_FORMATTER}`;
}

export function ktfmtMessage(advice: unknown): string {
  return `File is not formatted with ktfmt. ${textOf(fieldOf(advice, KTFMT))} ${NOT_YOUR_FORMATTER}`;
}

function ktlintFindings(reportRoot: string, advice: unknown): JavaFinding[] {
  return ingestSarif(readSarif(reportRoot, KTLINT_REPORT), { tool: KTLINT }).findings.map(
    (finding) => ({
      ...finding,
      rule: `${KTLINT_PREFIX}${finding.rule}`,
      message: `${finding.message ?? ''}. ${ktlintAdvice(advice, finding.rule)}`,
    }),
  );
}

function ktfmtFindings(reportRoot: string, advice: unknown): JavaFinding[] {
  return ingestFormatCheck(readFileSync(path.join(reportRoot, KTFMT_REPORT), 'utf8'), {
    tool: KTFMT,
    message: ktfmtMessage(advice),
  }).findings;
}

export function formatterFindings(
  reportRoot: string,
  formatter: unknown,
  advice: unknown,
): JavaFinding[] {
  if (formatter === KTLINT) {
    return ktlintFindings(reportRoot, advice);
  }
  return formatter === KTFMT ? ktfmtFindings(reportRoot, advice) : [];
}
