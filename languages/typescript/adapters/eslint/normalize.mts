import type TypeScript from 'typescript';
import { validatedProjectFile } from './paths.mts';
import { readFileSync } from 'node:fs';
import { typescriptApi } from '../typed/typescript-program.mts';
import {
  scriptKind,
  commentAt,
  findReportedNode,
  findStartedNode,
  stableSyntaxAnchor,
  eslintNodeType,
  enclosingSymbol,
  enclosingFunctionHash,
  syntaxFingerprint,
  commentFingerprint,
  normalizeMessageText,
} from './syntax.mts';
import {
  type EslintFinding,
  type EslintMessage,
  isFieldRecord as isRecord,
} from './typed/engine.mts';
import { routedEslintFields, withoutFatalDirectives } from '../hints/eslint-hints.mts';
import { nonRuleDiagnosticId } from './messages/non-rule-diagnostics.mts';
import { withoutSupersededMessages } from '../lint-engine/overlapping-reports.mts';
import {
  type RatchetPlan,
  assignSemanticOccurrences,
  metricOf,
  ratchetPlan,
  withRatchets,
} from './ratchets/ratchets.mts';
import { requiredString } from '../static-checks/arguments.mts';
import { collapseAnyChains } from './chains/any-chain.mts';
import { withCatchParameterWording } from './messages/catch-parameter.mts';
import { type Positions, reportedPositions } from './messages/message-positions.mts';
import { isFatal, unparsedNotes } from './messages/unparsed-file.mts';

type NormalizedMessage = {
  readonly finding: EslintFinding;
  readonly plan: RatchetPlan | undefined;
};

type LocatedReport = {
  readonly comment: string | undefined;
  readonly locatedNode: TypeScript.Node;
  readonly reportedNode: TypeScript.Node;
  readonly nodeType: string;
  readonly syntax: string;
};

type MessageContext = {
  readonly message: unknown;
  readonly context: string;
  readonly analyzerName: string;
  readonly relativePath: string;
  readonly sourceFile: TypeScript.SourceFile;
};

const ts = typescriptApi();

const REPORT_ONLY_RULES = new Set([
  'nitpicker/no-presence-truthiness',
  'nitpicker/no-empty-every-signal',
  'nitpicker/promise-wait-deadline',
  'nitpicker/no-check-then-write',
]);

export function normalizeEslintResults({
  value,
  projectRoot,
  analyzerName,
}: {
  readonly value: unknown;
  readonly projectRoot: string;
  readonly analyzerName: string;
}): EslintFinding[] {
  if (!Array.isArray(value)) {
    throw new TypeError('ESLint JSON output must be an array');
  }
  const normalized = value.flatMap((result, resultIndex) =>
    normalizeResult({ result, resultIndex, projectRoot, analyzerName }),
  );
  return withRatchets(
    assignSemanticOccurrences(normalized.map(({ finding }) => finding)),
    normalized.map(({ plan }) => plan),
  );
}

function normalizeResult({
  result,
  resultIndex,
  projectRoot,
  analyzerName,
}: {
  readonly result: unknown;
  readonly resultIndex: number;
  readonly projectRoot: string;
  readonly analyzerName: string;
}): NormalizedMessage[] {
  if (!isRecord(result) || typeof result.filePath !== 'string') {
    throw new TypeError(`ESLint result ${String(resultIndex)} must contain filePath`);
  }
  if (!Array.isArray(result.messages)) {
    throw new TypeError(`ESLint result ${String(resultIndex)} must contain messages`);
  }
  const projectFile = validatedProjectFile(projectRoot, result.filePath);
  const unsuperseded = withoutFatalDirectives(withoutSupersededMessages(result.messages));
  if (unsuperseded.length === 0) {
    return [];
  }
  const context = `ESLint result ${String(resultIndex)}`;
  return [
    ...unparsedNotes({
      messages: unsuperseded,
      context,
      relativePath: projectFile.relativePath,
      analyzerName,
    }),
    ...normalizeRuleMessages({
      messages: unsuperseded.filter((message) => !isFatal(message)),
      context,
      projectFile,
      analyzerName,
    }),
  ];
}

function normalizeRuleMessages({
  messages,
  context,
  projectFile,
  analyzerName,
}: {
  readonly messages: readonly unknown[];
  readonly context: string;
  readonly projectFile: { readonly relativePath: string; readonly canonicalPath: string };
  readonly analyzerName: string;
}): NormalizedMessage[] {
  if (messages.length === 0) {
    return [];
  }
  const { relativePath } = projectFile;
  const sourceFile = ts.createSourceFile(
    relativePath,
    readFileSync(projectFile.canonicalPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(relativePath),
  );
  return collapseAnyChains(messages, sourceFile).map((message, messageIndex) =>
    normalizeMessage({
      message,
      context: `${context} message ${String(messageIndex)}`,
      analyzerName,
      relativePath,
      sourceFile,
    }),
  );
}

function normalizeMessage({
  message,
  context,
  analyzerName,
  relativePath,
  sourceFile,
}: MessageContext): NormalizedMessage {
  assertMessageRecord(message, context);
  const messageText = requiredString(message.message, `${context}.message`);
  const ruleId = ruleIdOf(message, messageText);
  const positions = reportedPositions(message, context, sourceFile);
  const report = locateReport(sourceFile, positions);
  const messageIdentity = messageIdentityOf(message, messageText);
  const metric = metricOf(ruleId, messageText);
  const symbol = enclosingSymbol(report.reportedNode);
  const finding: EslintFinding = {
    tool: analyzerName,
    rule: ruleId,
    path: relativePath,
    identity: findingIdentity({ messageIdentity, report, metric, uses: message.chainUses }),
    ...hintedMessage({
      ruleId,
      messageText,
      relativePath,
      comment: report.comment,
      locatedNode: report.locatedNode,
      sourceFile,
    }),
    location: { line: positions.line, column: positions.column },
    classification: REPORT_ONLY_RULES.has(ruleId) ? 'descriptive' : 'enforceable',
  };
  if (symbol !== undefined) {
    finding.symbol = symbol;
  }
  const plan = ratchetPlan({
    metric,
    symbol,
    reportedNode: report.reportedNode,
    messageIdentity,
    uses: message.chainUses,
  });
  const anchorHash = plan && enclosingFunctionHash(report.reportedNode, symbol);
  return {
    finding,
    plan: plan === undefined || anchorHash === undefined ? plan : { ...plan, anchorHash },
  };
}

function ruleIdOf(message: EslintMessage, messageText: string): string {
  return typeof message.ruleId === 'string' && message.ruleId.length > 0
    ? message.ruleId
    : nonRuleDiagnosticId(messageText);
}

function findingIdentity({
  messageIdentity,
  report,
  metric,
  uses,
}: {
  readonly messageIdentity: string;
  readonly report: LocatedReport;
  readonly metric: { readonly value: number } | undefined;
  readonly uses: number | undefined;
}): string {
  return [
    `message:${messageIdentity}`,
    `node:${report.nodeType}`,
    `syntax:${report.syntax}`,
    ...(metric === undefined ? [] : [`value:${String(metric.value)}`]),
    ...(uses === undefined ? [] : [`uses:${String(uses)}`]),
  ].join('|');
}

function assertMessageRecord(message: unknown, context: string): asserts message is EslintMessage {
  if (!isRecord(message)) {
    throw new TypeError(`${context} must be an object`);
  }
}

function locateReport(
  sourceFile: TypeScript.SourceFile,
  { sourcePosition, endPosition }: Positions,
): LocatedReport {
  const comment = commentAt(sourceFile.text, sourcePosition, endPosition);
  const locatedNode =
    comment === undefined
      ? findReportedNode(sourceFile, sourcePosition, endPosition)
      : findStartedNode(sourceFile, sourcePosition);
  const reportedNode = stableSyntaxAnchor(locatedNode);
  const nodeType = comment === undefined ? eslintNodeType(reportedNode) : 'Comment';
  const syntax =
    comment === undefined ? syntaxFingerprint(reportedNode, nodeType) : commentFingerprint(comment);
  return { comment, locatedNode, reportedNode, nodeType, syntax };
}

function hintedMessage({
  ruleId,
  messageText,
  relativePath,
  comment,
  locatedNode,
  sourceFile,
}: {
  readonly ruleId: string;
  readonly messageText: string;
  readonly relativePath: string;
  readonly comment: string | undefined;
  readonly locatedNode: TypeScript.Node;
  readonly sourceFile: TypeScript.SourceFile;
}): { readonly message: string; readonly allowedForm?: string } {
  const fields = routedEslintFields({
    ruleId,
    text: messageText,
    relativePath,
    node: comment === undefined ? locatedNode : undefined,
    sourceFile,
  });
  return withCatchParameterWording(fields, { ruleId, comment, locatedNode });
}

function messageIdentityOf(message: EslintMessage, messageText: string): string {
  return typeof message.messageId === 'string' && message.messageId.length > 0
    ? message.messageId
    : normalizeMessageText(messageText);
}
