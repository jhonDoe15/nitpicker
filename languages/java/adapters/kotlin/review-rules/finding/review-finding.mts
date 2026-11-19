import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../../builds/module-path.mts';
import { definedField } from '../../../../../shared/messages/messages.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import {
  appendSentence,
  hasExceptionRoute,
} from '../../../../../shared/messages/exception-sentence.mjs';

import type { FindingFactory, ReviewFinding } from './typed/review-finding-types.mts';

type RouteInput = {
  rule: string;
  path: string;
  function: undefined;
  key: undefined;
  name: undefined;
};

const routeSentence: (input: RouteInput) => string | undefined = exceptionRoute;
const matcherOf: (
  exceptions: readonly unknown[],
) => (rule: string, ...candidates: string[]) => boolean = exceptionMatcher;
const optionalField: (name: string, value: string | undefined) => { allowedForm?: string } =
  definedField;
const identityCounter: () => (identity: string) => string = createIdentityCounter;
const routed: (message: string, sentence: string | undefined) => string = appendSentence;
const routeIn: (message: string) => boolean = hasExceptionRoute;

export const REVIEW_TOOL = 'pmd';
export const SOURCE_TOOL = 'kotlin-source';

const PRINTED_TOOLS = new Set([REVIEW_TOOL, SOURCE_TOOL]);

type RouteTarget = { tool: string; rule: string; file: string; message: string };

function withRoute(input: RouteTarget): string {
  const { tool, rule, file, message } = input;
  if (routeIn(message)) {
    return message;
  }
  const exceptionRule = PRINTED_TOOLS.has(tool) ? `${tool}/${rule}` : rule;
  return routed(
    message,
    routeSentence({
      rule: exceptionRule,
      path: file,
      function: undefined,
      key: undefined,
      name: undefined,
    }),
  );
}

export function findingFactory(): FindingFactory {
  const next = identityCounter();
  return ({ tool = REVIEW_TOOL, rule, file, line, symbol, key, message, allowedForm }) => ({
    tool,
    rule,
    path: file,
    identity: next(`${rule}:${key ?? symbol}`),
    symbol,
    location: { line },
    message: withRoute({ tool, rule, file, message: message ?? '' }),
    ...optionalField('allowedForm', allowedForm),
    classification: 'enforceable',
  });
}

const COVERED_FINDINGS: Record<string, string[]> = {
  'kotlin-source/HttpWithoutTimeout': [
    'pmd/SpringHttpClientTimeouts',
    'pmd/SpringHttpClientPerCall',
  ],
  'kotlin-source/ReactorBlockWithoutTimeout': ['kotlin-source/BlockingCallInCoroutine'],
  'kotlin-source/UnboundedWait': ['kotlin-source/BlockingCallInCoroutine'],
  'kotlin-source/CatchOnlyLogsOrReturnsDefault': [
    'pmd/SwallowedInterrupt',
    'pmd/SwallowedCancellation',
  ],
  'detekt.coroutines.SleepInsteadOfDelay': ['pmd/FixedSleepInTest'],
};

function printedRule({ tool, rule }: { tool: string; rule: string }): string {
  return tool === 'detekt' ? rule : `${tool}/${rule}`;
}

function lineKey(
  rule: string,
  { path, location }: { path: string; location?: { line?: number | undefined } | undefined },
): string {
  return `${rule}\0${path}\0${String(location?.line)}`;
}

export function withoutCoveredFindings<
  Found extends Pick<ReviewFinding, 'tool' | 'rule' | 'path'> & {
    location?: { line?: number | undefined } | undefined;
  },
>(
  findings: Found[],
  { exceptions = [], modulePath }: { exceptions?: readonly unknown[]; modulePath?: string } = {},
): Found[] {
  const lifted = matcherOf(exceptions);
  const reported = new Set(
    findings
      .filter(
        (finding) =>
          PRINTED_TOOLS.has(finding.tool) &&
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
