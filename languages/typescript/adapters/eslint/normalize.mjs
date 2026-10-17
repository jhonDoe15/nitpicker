import { validatedProjectFile } from './paths.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  scriptKind,
  commentAt,
  findReportedNode,
  findStartedNode,
  stableSyntaxAnchor,
  eslintNodeType,
  enclosingSymbol,
  syntaxFingerprint,
  commentFingerprint,
  normalizeMessageText,
  nodeChain,
} from './syntax.mjs';
import {
  growthAdviceFor,
  metricWorseMessage,
  routedEslintMessage,
  withoutFatalDirectives,
} from '../hints/eslint-hints.mjs';
import { requiredString, positiveInteger } from './arguments.mjs';

export function normalizeEslintResults({ value, projectRoot, analyzerName }) {
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

function normalizeResult({ result, resultIndex, projectRoot, analyzerName }) {
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

const supersedingRules = new Map([['no-restricted-properties', 'nitpicker/react-no-random-key']]);

function startOf(ruleId, message) {
  return `${String(ruleId)}@${String(message.line)}:${String(message.column)}`;
}

function withoutSupersededMessages(messages) {
  const starts = new Set(
    messages.filter(isRecord).map((message) => startOf(message.ruleId, message)),
  );
  return messages.filter((message) => {
    const superseding = isRecord(message) ? supersedingRules.get(message.ruleId) : undefined;
    return superseding === undefined || !starts.has(startOf(superseding, message));
  });
}

function metricRules() {
  return {
    'nitpicker/cognitive-complexity': {
      pattern: /cognitive complexity of (\d+);/u,
      label: 'cognitive complexity',
    },
    complexity: { pattern: /complexity of (\d+)\./u, label: 'complexity' },
    'max-lines-per-function': { pattern: /too many lines \((\d+)\)/u, label: 'line count' },
    'max-statements': { pattern: /too many statements \((\d+)\)/u, label: 'statement count' },
    'max-params': { pattern: /too many parameters \((\d+)\)/u, label: 'parameter count' },
    'max-depth': { pattern: /nested too deeply \((\d+)\)/u, label: 'block nesting' },
  };
}

function metricOf(ruleId, messageText) {
  const rule = metricRules()[ruleId];
  const amount = rule === undefined ? undefined : rule.pattern.exec(messageText)?.[1];
  return amount === undefined ? undefined : { value: Number(amount), label: rule.label };
}

function countGroupOf(finding, plan) {
  return JSON.stringify([finding.rule, finding.path, finding.symbol, plan.kind, plan.key]);
}

function withRatchets(findings, plans) {
  const counts = new Map();
  const occurrences = new Map();
  for (const [index, finding] of findings.entries()) {
    const plan = plans[index];
    if (plan?.kind === 'count') {
      counts.set(countGroupOf(finding, plan), (counts.get(countGroupOf(finding, plan)) ?? 0) + 1);
    }
  }
  return findings.map((finding, index) => {
    const plan = plans[index];
    if (plan === undefined) {
      return finding;
    }
    if (plan.kind === 'count') {
      const growthAdvice = growthAdviceFor(finding.rule);
      return {
        ...finding,
        ratchet: {
          key: `count:${plan.key}`,
          value: counts.get(countGroupOf(finding, plan)),
          existingCodeOnly: true,
          ...(growthAdvice === undefined ? {} : { growthAdvice }),
        },
      };
    }
    const group = JSON.stringify([finding.rule, finding.path, finding.symbol]);
    const occurrence = (occurrences.get(group) ?? 0) + 1;
    occurrences.set(group, occurrence);
    return {
      ...finding,
      ratchet: {
        key: `metric:occurrence:${String(occurrence)}`,
        value: plan.value,
        worseMessage: metricWorseMessage(finding, plan),
      },
    };
  });
}

function normalizeMessage({ message, context, analyzerName, relativePath, sourceFile }) {
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
  const finding = {
    tool: analyzerName,
    rule: ruleId,
    path: relativePath,
    identity: [
      `message:${messageIdentity}`,
      `node:${report.nodeType}`,
      `syntax:${report.syntax}`,
      ...(metric === undefined ? [] : [`value:${String(metric.value)}`]),
    ].join('|'),
    message: hintedMessage({
      ruleId,
      messageText,
      relativePath,
      comment: report.comment,
      locatedNode: report.locatedNode,
      sourceFile,
    }),
    location: { line: positions.line, column: positions.column },
    classification: 'enforceable',
  };
  if (symbol !== undefined) {
    finding.symbol = symbol;
  }
  const plan = ratchetPlan({ metric, symbol, reportedNode: report.reportedNode, messageIdentity });
  return { finding, plan };
}

function validatedMessageText(message, context) {
  if (!isRecord(message)) {
    throw new TypeError(`${context} must be an object`);
  }
  const messageText = requiredString(message.message, `${context}.message`);
  if (message.fatal === true) {
    throw new Error(`${context} is fatal: ${messageText}`);
  }
  return messageText;
}

function locateReport(sourceFile, { sourcePosition, endPosition }) {
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

function hintedMessage({ ruleId, messageText, relativePath, comment, locatedNode, sourceFile }) {
  return routedEslintMessage({
    ruleId,
    text: messageText,
    relativePath,
    node: comment === undefined ? locatedNode : undefined,
    sourceFile,
  });
}

function reportedPositions(message, context, sourceFile) {
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

function messageIdentityOf(message, messageText) {
  return typeof message.messageId === 'string' && message.messageId.length > 0
    ? message.messageId
    : normalizeMessageText(messageText);
}

function ratchetPlan({ metric, symbol, reportedNode, messageIdentity }) {
  if (metric !== undefined) {
    return { kind: 'metric', ...metric };
  }
  return symbol !== undefined && isInsideFunction(reportedNode)
    ? { kind: 'count', key: messageIdentity }
    : undefined;
}

function isInsideFunction(node) {
  return nodeChain(node).some(
    (current) => ts.isFunctionLike(current) && current.body !== undefined,
  );
}

function assignSemanticOccurrences(findings) {
  const occurrences = new Map();
  return findings.map((finding) => {
    const semanticKey = JSON.stringify([
      finding.tool,
      finding.rule,
      finding.path,
      finding.symbol ?? '',
      finding.identity,
    ]);
    const occurrence = (occurrences.get(semanticKey) ?? 0) + 1;
    occurrences.set(semanticKey, occurrence);
    return {
      ...finding,
      identity: `${finding.identity}|occurrence:${String(occurrence)}`,
    };
  });
}

function nonRuleDiagnosticId(message, context) {
  if (message.startsWith('Unused eslint-disable directive')) {
    return 'eslint/unused-disable-directive';
  }
  if (message.includes("has no effect because you have 'noInlineConfig' setting")) {
    return 'eslint/inline-config-disabled';
  }
  throw new Error(`${context} has no rule identifier: ${message}`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
