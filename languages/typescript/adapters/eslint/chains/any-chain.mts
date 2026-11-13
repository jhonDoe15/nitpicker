import type TypeScript from 'typescript';
import { typescriptApi } from '../../typed/typescript-program.mts';
import { nodeChain, enclosingSymbol, findReportedNode, stableSyntaxAnchor } from '../syntax.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

type Node = TypeScript.Node;
type SourceFile = TypeScript.SourceFile;
type Identifier = TypeScript.Identifier;

type ChainMessage = {
  readonly ruleId: string;
  readonly message: string;
  readonly messageId?: unknown;
  readonly line: number;
  readonly column: number;
  readonly endLine?: unknown;
  readonly endColumn?: unknown;
  readonly chainUses?: number;
};

type Cause = { readonly name: string; readonly declared?: Identifier };

type Grouping = Cause & { readonly symbol: string; readonly key: string };

type Place = {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
};

const ts = typescriptApi();

const CAUSE_ORDER: readonly string[] = [
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/restrict-plus-operands',
  '@typescript-eslint/restrict-template-expressions',
];
const COLLAPSED_RULE = '@typescript-eslint/no-unsafe-member-access';
const ANY_CHAIN_MESSAGE_ID = 'anyChain';
const ANY_TYPE = /[`'"]any[`'"]/u;
const ERROR_TYPE = /\berror\b/u;

function isChainMessage(message: unknown): message is ChainMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const ruleId = fieldOf(message, 'ruleId');
  const text = fieldOf(message, 'message');
  return (
    typeof ruleId === 'string' &&
    CAUSE_ORDER.includes(ruleId) &&
    typeof text === 'string' &&
    ANY_TYPE.test(text) &&
    !ERROR_TYPE.test(text) &&
    Number.isInteger(fieldOf(message, 'line')) &&
    Number.isInteger(fieldOf(message, 'column'))
  );
}

function positionOf(sourceFile: SourceFile, line: number, column: number): number {
  return sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
}

function reportedNodeOf(message: ChainMessage, sourceFile: SourceFile): Node {
  const start = positionOf(sourceFile, message.line, message.column);
  const { endLine, endColumn } = message;
  const end =
    typeof endLine === 'number' &&
    typeof endColumn === 'number' &&
    Number.isInteger(endLine) &&
    Number.isInteger(endColumn)
      ? positionOf(sourceFile, endLine, endColumn)
      : undefined;
  return stableSyntaxAnchor(findReportedNode(sourceFile, start, end));
}

function nextToward(current: Node): Node | undefined {
  if (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current) ||
    ts.isCallExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTemplateSpan(current)
  ) {
    return current.expression;
  }
  if (ts.isReturnStatement(current)) {
    return current.expression;
  }
  return ts.isVariableDeclaration(current) ? current.initializer : undefined;
}

function rootIdentifier(node: Node): Identifier | undefined {
  const start =
    ts.isIdentifier(node) && ts.isPropertyAccessExpression(node.parent) ? node.parent : node;
  const steps: Node[] = [start];
  for (const current of steps) {
    const next = nextToward(current);
    if (next !== undefined) {
      steps.push(next);
    }
  }
  const last = steps.at(-1);
  return last !== undefined && ts.isIdentifier(last) ? last : undefined;
}

function innerNames(pattern: TypeScript.BindingPattern): TypeScript.BindingName[] {
  return pattern.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : [element.name],
  );
}

function bindingNames(name: TypeScript.BindingName): Identifier[] {
  const pending: TypeScript.BindingName[] = [name];
  const names: Identifier[] = [];
  for (const current of pending) {
    if (ts.isIdentifier(current)) {
      names.push(current);
    } else {
      pending.push(...innerNames(current));
    }
  }
  return names;
}

function namesDeclaredBy(scope: Node): Identifier[] {
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

function findDeclaredName(identifier: Identifier, owner: Node): Identifier | undefined {
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

function declarationOf(name: Identifier): Node | undefined {
  return nodeChain(name).find(
    (current) => ts.isParameter(current) || ts.isVariableDeclaration(current),
  );
}

function callbackReceiver(callback: Node): Identifier | undefined {
  const call = callback.parent;
  return ts.isCallExpression(call) &&
    call.arguments.some((argument) => argument === callback) &&
    ts.isPropertyAccessExpression(call.expression)
    ? rootIdentifier(call.expression.expression)
    : undefined;
}

function causeOf(identifier: Identifier, owner: Node): Cause {
  const candidates: Identifier[] = [identifier];
  for (const current of candidates) {
    const declared = findDeclaredName(current, owner);
    if (declared === undefined) {
      return { name: current.text };
    }
    const declaration = declarationOf(declared);
    const receiver =
      declaration !== undefined && ts.isParameter(declaration) && declaration.type === undefined
        ? callbackReceiver(declaration.parent)
        : undefined;
    if (receiver === undefined) {
      return { name: declared.text, declared };
    }
    candidates.push(receiver);
  }
  return { name: identifier.text };
}

function groupingOf(message: ChainMessage, sourceFile: SourceFile): Grouping | undefined {
  const node = reportedNodeOf(message, sourceFile);
  const owner = nodeChain(node).find(
    (current) => ts.isFunctionLike(current) && 'body' in current && current.body !== undefined,
  );
  if (owner === undefined) {
    return undefined;
  }
  const symbol = enclosingSymbol(owner);
  if (symbol === undefined) {
    return undefined;
  }
  const root = rootIdentifier(node);
  const cause = root === undefined ? { name: '' } : causeOf(root, owner);
  return { ...cause, symbol, key: JSON.stringify([symbol, cause.name]) };
}

function isBefore(left: ChainMessage, right: ChainMessage): boolean {
  return left.line < right.line || (left.line === right.line && left.column < right.column);
}

function representative(group: readonly ChainMessage[]): ChainMessage | undefined {
  const rule = CAUSE_ORDER.find((candidate) => group.some(({ ruleId }) => ruleId === candidate));
  return group
    .filter(({ ruleId }) => ruleId === rule)
    .reduce<ChainMessage | undefined>(
      (first, message) => (first === undefined || isBefore(message, first) ? message : first),
      undefined,
    );
}

function declarationPlace(declared: Identifier, sourceFile: SourceFile): Place {
  const start = sourceFile.getLineAndCharacterOfPosition(declared.getStart());
  const end = sourceFile.getLineAndCharacterOfPosition(declared.getEnd());
  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function collapsed({
  first,
  uses,
  grouping,
  sourceFile,
}: {
  readonly first: ChainMessage;
  readonly uses: number;
  readonly grouping: Grouping;
  readonly sourceFile: SourceFile;
}): ChainMessage {
  const value = grouping.name === '' ? 'an `any` value' : `the \`any\` value \`${grouping.name}\``;
  const text = `Unsafe use of ${value} in ${grouping.symbol}: it affects ${String(uses)} ${uses === 1 ? 'place' : 'places'}.`;
  return {
    ...first,
    ...(grouping.declared === undefined ? {} : declarationPlace(grouping.declared, sourceFile)),
    ruleId: COLLAPSED_RULE,
    message: text,
    messageId: `${ANY_CHAIN_MESSAGE_ID}:${grouping.name}`,
    chainUses: uses,
  };
}

export function collapseAnyChains(messages: readonly unknown[], sourceFile: SourceFile): unknown[] {
  const groups = new Map<string, ChainMessage[]>();
  const groupingOfMessage = new Map<unknown, Grouping>();
  for (const message of messages.filter(isChainMessage)) {
    const grouping = groupingOf(message, sourceFile);
    if (grouping !== undefined) {
      groupingOfMessage.set(message, grouping);
      groups.set(grouping.key, [...(groups.get(grouping.key) ?? []), message]);
    }
  }
  const emitted = new Set<string>();
  return messages.flatMap((message) => {
    const grouping = groupingOfMessage.get(message);
    if (grouping === undefined) {
      return [message];
    }
    const group = groups.get(grouping.key) ?? [];
    const first = representative(group);
    if (emitted.has(grouping.key) || first !== message || first === undefined) {
      return [];
    }
    emitted.add(grouping.key);
    return [collapsed({ first, uses: group.length, grouping, sourceFile })];
  });
}
