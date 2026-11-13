import { ts } from '../../../typescript-api/typescript-api.mjs';
import { nodeChain, enclosingSymbol, findReportedNode, stableSyntaxAnchor } from '../syntax.mjs';

const CAUSE_ORDER = [
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/restrict-plus-operands',
  '@typescript-eslint/restrict-template-expressions',
];
const ANY_CHAIN_MESSAGE_ID = 'anyChain';
const ANY_TYPE = /[`'"]any[`'"]/u;
const ERROR_TYPE = /\berror\b/u;
const FOLLOWED = [
  ts.isPropertyAccessExpression,
  ts.isElementAccessExpression,
  ts.isCallExpression,
  ts.isNonNullExpression,
  ts.isParenthesizedExpression,
  ts.isAsExpression,
];

function isChainMessage(message) {
  return (
    typeof message === 'object' &&
    message !== null &&
    CAUSE_ORDER.includes(message.ruleId) &&
    typeof message.message === 'string' &&
    ANY_TYPE.test(message.message) &&
    !ERROR_TYPE.test(message.message) &&
    Number.isInteger(message.line) &&
    Number.isInteger(message.column)
  );
}

function positionOf(sourceFile, line, column) {
  return sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
}

function reportedNodeOf(message, sourceFile) {
  const start = positionOf(sourceFile, message.line, message.column);
  const end =
    Number.isInteger(message.endLine) && Number.isInteger(message.endColumn)
      ? positionOf(sourceFile, message.endLine, message.endColumn)
      : undefined;
  return stableSyntaxAnchor(findReportedNode(sourceFile, start, end));
}

function nextToward(current) {
  if (
    FOLLOWED.some((test) => test(current)) ||
    ts.isReturnStatement(current) ||
    ts.isTemplateSpan(current)
  ) {
    return current.expression;
  }
  return ts.isVariableDeclaration(current) ? current.initializer : undefined;
}

function rootIdentifier(node) {
  const start =
    ts.isIdentifier(node) && ts.isPropertyAccessExpression(node.parent) ? node.parent : node;
  const path = [start];
  for (const current of path) {
    const next = nextToward(current);
    if (next !== undefined) {
      path.push(next);
    }
  }
  const last = path.at(-1);
  return ts.isIdentifier(last) ? last : undefined;
}

function bindingNames(name) {
  const pending = [name];
  const names = [];
  for (const current of pending) {
    if (ts.isIdentifier(current)) {
      names.push(current);
    } else {
      pending.push(
        ...current.elements
          .filter((element) => !ts.isOmittedExpression(element))
          .map(({ name: inner }) => inner),
      );
    }
  }
  return names;
}

function namesDeclaredBy(scope) {
  if (ts.isFunctionLike(scope)) {
    return scope.parameters.flatMap((parameter) => bindingNames(parameter.name));
  }
  if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
    return scope.statements
      .filter(ts.isVariableStatement)
      .flatMap(({ declarationList }) =>
        declarationList.declarations.flatMap(({ name }) => bindingNames(name)),
      );
  }
  return [];
}

function findDeclaredName(identifier, owner) {
  const chain = nodeChain(identifier.parent);
  const ownerIndex = chain.indexOf(owner);
  const scopes = ownerIndex === -1 ? chain : chain.slice(0, ownerIndex + 1);
  for (const scope of scopes) {
    const found = namesDeclaredBy(scope).find(({ text }) => text === identifier.text);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function declarationOf(name) {
  return nodeChain(name).find(
    (current) => ts.isParameter(current) || ts.isVariableDeclaration(current),
  );
}

function callbackReceiver(callback) {
  const call = callback.parent;
  return ts.isCallExpression(call) &&
    call.arguments.includes(callback) &&
    ts.isPropertyAccessExpression(call.expression)
    ? rootIdentifier(call.expression.expression)
    : undefined;
}

function causeOf(identifier, owner) {
  const candidates = [identifier];
  for (const current of candidates) {
    const declared = findDeclaredName(current, owner);
    if (declared === undefined) {
      return { name: current.text };
    }
    const declaration = declarationOf(declared);
    const receiver =
      ts.isParameter(declaration) && declaration.type === undefined
        ? callbackReceiver(declaration.parent)
        : undefined;
    if (receiver === undefined) {
      return { name: declared.text, declared };
    }
    candidates.push(receiver);
  }
  return { name: identifier.text };
}

function groupingOf(message, sourceFile) {
  const node = reportedNodeOf(message, sourceFile);
  const owner = nodeChain(node).find(
    (current) => ts.isFunctionLike(current) && current.body !== undefined,
  );
  if (owner === undefined) {
    return undefined;
  }
  const root = rootIdentifier(node);
  const cause = root === undefined ? { name: '' } : causeOf(root, owner);
  const symbol = enclosingSymbol(owner);
  return { ...cause, symbol, key: JSON.stringify([symbol, cause.name]) };
}

function isBefore(left, right) {
  return left.line < right.line || (left.line === right.line && left.column < right.column);
}

function representative(group) {
  const rule = CAUSE_ORDER.find((candidate) => group.some(({ ruleId }) => ruleId === candidate));
  return group
    .filter(({ ruleId }) => ruleId === rule)
    .reduce((first, message) => (isBefore(message, first) ? message : first));
}

function declarationPlace(declared, sourceFile) {
  const start = sourceFile.getLineAndCharacterOfPosition(declared.getStart());
  const end = sourceFile.getLineAndCharacterOfPosition(declared.getEnd());
  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function collapsed({ group, grouping, sourceFile }) {
  const first = representative(group);
  const uses = group.length;
  const value = grouping.name === '' ? 'an `any` value' : `the \`any\` value \`${grouping.name}\``;
  const text = `Unsafe use of ${value} in ${grouping.symbol}: it affects ${String(uses)} ${uses === 1 ? 'place' : 'places'}.`;
  return {
    ...first,
    ...(grouping.declared === undefined ? {} : declarationPlace(grouping.declared, sourceFile)),
    ruleId: CAUSE_ORDER[0],
    message: text,
    messageId: `${ANY_CHAIN_MESSAGE_ID}:${grouping.name}`,
    chainUses: uses,
  };
}

export function collapseAnyChains(messages, sourceFile) {
  const groups = new Map();
  const groupingOfMessage = new Map();
  for (const message of messages.filter(isChainMessage)) {
    const grouping = groupingOf(message, sourceFile);
    if (grouping !== undefined && grouping.symbol !== undefined) {
      groupingOfMessage.set(message, grouping);
      groups.set(grouping.key, [...(groups.get(grouping.key) ?? []), message]);
    }
  }
  const emitted = new Set();
  return messages.flatMap((message) => {
    const grouping = groupingOfMessage.get(message);
    if (grouping === undefined) {
      return [message];
    }
    const group = groups.get(grouping.key);
    if (emitted.has(grouping.key) || representative(group) !== message) {
      return [];
    }
    emitted.add(grouping.key);
    return [collapsed({ group, grouping, sourceFile })];
  });
}
