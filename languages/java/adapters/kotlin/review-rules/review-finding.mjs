import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../../builds/module-path.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import {
  appendSentence,
  hasExceptionRoute,
} from '../../../../../shared/messages/exception-sentence.mjs';

export const REVIEW_TOOL = 'pmd';

function withRoute({ tool, rule, file, message }) {
  if (hasExceptionRoute(message)) {
    return message;
  }
  const exceptionRule = tool === REVIEW_TOOL ? `${tool}/${rule}` : rule;
  return appendSentence(message, exceptionRoute({ rule: exceptionRule, path: file }));
}

export function findingFactory() {
  const next = createIdentityCounter();
  return ({ tool = REVIEW_TOOL, rule, file, line, symbol, key, message }) => ({
    tool,
    rule,
    path: file,
    identity: next(`${rule}:${key ?? symbol}`),
    symbol,
    location: { line },
    message: withRoute({ tool, rule, file, message }),
    classification: 'enforceable',
  });
}

const COVERED_FINDINGS = {
  'kotlin-source/HttpWithoutTimeout': [
    'pmd/SpringHttpClientTimeouts',
    'pmd/SpringHttpClientPerCall',
  ],
  'kotlin-source/IoCallInLoop': [
    'pmd/SpringDataNoSaveInLoop',
    'pmd/SpringDataBatchOfOne',
    'pmd/SpringDataRowWriteInLoop',
    'pmd/SpringDataSaveInLoopHelper',
  ],
  'kotlin-source/CatchOnlyLogsOrReturnsDefault': [
    'pmd/SwallowedInterrupt',
    'pmd/SwallowedCancellation',
  ],
  'detekt.coroutines.SleepInsteadOfDelay': ['pmd/FixedSleepInTest'],
};

function printedRule({ tool, rule }) {
  return tool === 'detekt' ? rule : `${tool}/${rule}`;
}

function lineKey(rule, { path, location }) {
  return `${rule}\0${path}\0${String(location?.line)}`;
}

export function withoutCoveredFindings(findings, { exceptions = [], modulePath } = {}) {
  const lifted = exceptionMatcher(exceptions);
  const reported = new Set(
    findings
      .filter(
        (finding) =>
          finding.tool === REVIEW_TOOL &&
          !lifted(printedRule(finding), inModule(modulePath, finding.path)),
      )
      .map((finding) => lineKey(printedRule(finding), finding)),
  );
  return findings.filter(
    (finding) =>
      !(COVERED_FINDINGS[printedRule(finding)] ?? []).some((covering) =>
        reported.has(lineKey(covering, finding)),
      ),
  );
}
