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
} from './typed/syntax.mts';
import {
  type EslintFinding,
  type EslintMessage,
  isFieldRecord as isRecord,
} from './typed/engine.mts';
import { routedEslintFields, withoutFatalDirectives } from '../hints/eslint-hints.mts';
import { positiveInteger } from './arguments.mts';
import { withoutSupersededMessages } from '../lint-engine/overlapping-reports.mts';
import {
  type RatchetPlan,
  assignSemanticOccurrences,
  metricOf,
  ratchetPlan,
  withRatchets,
} from './ratchets/ratchets.mts';
import { requiredString } from '../static-checks/arguments.mts';

type NormalizedMessage = {
  readonly finding: EslintFinding;
  readonly plan: RatchetPlan | undefined;
};

type Positions = {
  readonly line: number;
  readonly column: number;
  readonly sourcePosition: number;
  readonly endPosition: number | undefined;
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

const REPORT_ONLY_RULES = new Set(['nitpicker/promise-wait-deadline']);

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
  const messages = withoutFatalDirectives(withoutSupersededMessages(result.messages));
  if (messages.length === 0) {
    return [];
  }
  const relativePath = projectFile.relativePath;
  const source = readFileSync(projectFile.canonicalPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(relativePath),
  );
  return messages.map((message, messageIndex) =>
    normalizeMessage({
      message,
      context: `ESLint result ${String(resultIndex)} message ${String(messageIndex)}`,
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
  const messageText = validatedMessageText(message, context);
  const ruleId =
    typeof message.ruleId === 'string' && message.ruleId.length > 0
      ? message.ruleId
      : nonRuleDiagnosticId(messageText, context);
  const positions = reportedPositions(message, context, sourceFile);
  const report = locateReport(sourceFile, positions);
  const messageIdentity = messageIdentityOf(message, messageText);
  const metric = metricOf(ruleId, messageText);
  const symbol = enclosingSymbol(report.reportedNode);
  const finding: EslintFinding = {
    tool: analyzerName,
    rule: ruleId,
    path: relativePath,
    identity: [
      `message:${messageIdentity}`,
      `node:${report.nodeType}`,
      `syntax:${report.syntax}`,
      ...(metric === undefined ? [] : [`value:${String(metric.value)}`]),
    ].join('|'),
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
  const plan = ratchetPlan({ metric, symbol, reportedNode: report.reportedNode, messageIdentity });
  const anchorHash = plan && enclosingFunctionHash(report.reportedNode, symbol);
  return {
    finding,
    plan: plan === undefined || anchorHash === undefined ? plan : { ...plan, anchorHash },
  };
}

function assertMessageRecord(message: unknown, context: string): asserts message is EslintMessage {
  if (!isRecord(message)) {
    throw new TypeError(`${context} must be an object`);
  }
}

function validatedMessageText(message: EslintMessage, context: string): string {
  const messageText = requiredString(message.message, `${context}.message`);
  if (message.fatal === true) {
    throw new Error(`${context} is fatal: ${messageText}`);
  }
  return messageText;
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
  return routedEslintFields({
    ruleId,
    text: messageText,
    relativePath,
    node: comment === undefined ? locatedNode : undefined,
    sourceFile,
  });
}

function reportedPositions(
  message: EslintMessage,
  context: string,
  sourceFile: TypeScript.SourceFile,
): Positions {
  const line = positiveInteger(message.line, `${context}.line`);
  const column = positiveInteger(message.column, `${context}.column`);
  const sourcePosition = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
  const endPosition =
    message.endLine === undefined || message.endColumn === undefined
      ? undefined
      : sourceFile.getPositionOfLineAndCharacter(
          positiveInteger(message.endLine, `${context}.endLine`) - 1,
          positiveInteger(message.endColumn, `${context}.endColumn`) - 1,
        );
  return { line, column, sourcePosition, endPosition };
}

function messageIdentityOf(message: EslintMessage, messageText: string): string {
  return typeof message.messageId === 'string' && message.messageId.length > 0
    ? message.messageId
    : normalizeMessageText(messageText);
}

function nonRuleDiagnosticId(message: string, context: string): string {
  if (message.startsWith('Unused eslint-disable directive')) {
    return 'eslint/unused-disable-directive';
  }
  if (message.includes("has no effect because you have 'noInlineConfig' setting")) {
    return 'eslint/inline-config-disabled';
  }
  throw new Error(`${context} has no rule identifier: ${message}`);
}
