import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue } from '../analysis/constant-resolution.mts';
import { isEnvRead } from '../database/orm-options.mts';
import { isAbsent } from '../security/http/http-config.mts';
import { resolvedValue, staticKey, type Context } from '../security/security-values.mts';

export const SET = 'set';
export const MISSING = 'missing';
export const UNKNOWN = 'unknown';

export type State = typeof SET | typeof MISSING | typeof UNKNOWN;
export type Timeout = {
  readonly kind: 'aws' | 'database';
  readonly name: string | undefined;
  readonly state: State;
};
export type TimeoutOptions = {
  readonly context: Context;
  readonly entries: TSESTree.Property[];
  opaque: boolean;
};
type MaybeNode = TSESTree.Node | undefined;
type Reference = TSESLint.Scope.Reference;
type Piece = { readonly text: string; readonly complete: boolean };

const TIMEOUT_KEYS = ['statement_timeout', 'query_timeout'];
const ZERO_VALUE = /^0+(?:ms|s)?$/u;
const SEPARATORS = new Set([' ', '\t', '=', ':', "'", '"']);
const MAX_SPREADS = 4;
const SPREAD_ROUNDS = Array.from({ length: MAX_SPREADS }, (_, round) => round);

export function either(states: readonly State[]): State {
  if (states.includes(SET)) {
    return SET;
  }
  return states.includes(UNKNOWN) ? UNKNOWN : MISSING;
}

function isConcatenation(node: MaybeNode): node is TSESTree.BinaryExpression {
  return node?.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+';
}

function pieceText(piece: MaybeNode): Piece {
  if (piece?.type === AST_NODE_TYPES.TemplateLiteral) {
    const text = piece.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
    return { text, complete: piece.expressions.length === 0 };
  }
  const text = stringValue(piece);
  return { text: text ?? '', complete: text !== undefined };
}

function visibleText(context: Context, node: MaybeNode): Piece {
  const pieces = SPREAD_ROUNDS.reduce<MaybeNode[]>(
    (current) =>
      current.flatMap((piece) =>
        isConcatenation(piece)
          ? [resolvedValue(context, piece.left), resolvedValue(context, piece.right)]
          : [piece],
      ),
    [resolvedValue(context, node)],
  ).map(pieceText);
  return {
    text: pieces.map((piece) => piece.text).join(''),
    complete: pieces.every((piece) => piece.complete),
  };
}

export function textOf(context: Context, node: MaybeNode): string | undefined {
  const visible = visibleText(context, node);
  return visible.complete ? visible.text : undefined;
}

function settingValue(rest: string): string {
  const decoded = rest.replaceAll(/%3D/giu, '=');
  const first = Array.from(decoded).findIndex((char) => !SEPARATORS.has(char));
  return first === -1 ? '' : (/^[\w.]*/u.exec(decoded.slice(first))?.[0] ?? '');
}

export function carriesTimeout(text: string): boolean {
  return TIMEOUT_KEYS.some((key) =>
    text
      .split(key)
      .slice(1)
      .some((rest) => !ZERO_VALUE.test(settingValue(rest))),
  );
}

export function textState(context: Context, node: MaybeNode, unknownText: State): State {
  const visible = visibleText(context, node);
  if (carriesTimeout(visible.text)) {
    return SET;
  }
  return visible.complete ? MISSING : unknownText;
}

function spreadItems(
  context: Context,
  items: readonly TSESTree.ObjectLiteralElement[],
  options: TimeoutOptions,
): TSESTree.ObjectLiteralElement[] {
  return items.flatMap((entry) => {
    if (entry.type !== AST_NODE_TYPES.SpreadElement) {
      return [entry];
    }
    const inner = resolvedValue(context, entry.argument);
    if (inner?.type === AST_NODE_TYPES.ObjectExpression) {
      return inner.properties;
    }
    options.opaque = true;
    return [];
  });
}

export function optionsOf(context: Context, node: MaybeNode): TimeoutOptions | undefined {
  const object = node === undefined ? undefined : resolvedValue(context, node);
  if (object?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const options: TimeoutOptions = { context, entries: [], opaque: false };
  const items = SPREAD_ROUNDS.reduce(
    (current) => spreadItems(context, current, options),
    object.properties,
  );
  for (const entry of items) {
    if (entry.type === AST_NODE_TYPES.Property && staticKey(entry) !== undefined) {
      options.entries.push(entry);
    } else {
      options.opaque = true;
    }
  }
  return options;
}

export function valueOf(options: TimeoutOptions, key: string): TSESTree.Node | undefined {
  return options.entries.findLast((entry) => staticKey(entry) === key)?.value;
}

function absentState(options: TimeoutOptions): State {
  return options.opaque ? UNKNOWN : MISSING;
}

export function keyState(options: TimeoutOptions, key: string): State {
  const value = valueOf(options, key);
  if (value === undefined) {
    return absentState(options);
  }
  return isAbsent(options.context, value) ? MISSING : SET;
}

function textKeyState(options: TimeoutOptions, key: string, unknownText: State): State {
  const value = valueOf(options, key);
  return value === undefined
    ? absentState(options)
    : textState(options.context, value, unknownText);
}

export function nestedState(
  options: TimeoutOptions,
  key: string,
  judge: (context: Context, node: TSESTree.Node) => State,
): State {
  const value = valueOf(options, key);
  return value === undefined ? absentState(options) : judge(options.context, value);
}

export function postgresOptionsState(context: Context, node: MaybeNode): State {
  if (node === undefined || isEnvRead(node)) {
    return MISSING;
  }
  if (textOf(context, node) !== undefined) {
    return textState(context, node, MISSING);
  }
  const options = optionsOf(context, node);
  if (options === undefined) {
    return UNKNOWN;
  }
  return either([
    keyState(options, 'statement_timeout'),
    keyState(options, 'query_timeout'),
    textKeyState(options, 'options', UNKNOWN),
    textKeyState(options, 'connectionString', MISSING),
  ]);
}

export function referencesOfDeclaredVariable(
  context: Context,
  declarator: MaybeNode,
): readonly Reference[] {
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return [];
  }
  return findVariable(context, declarator.id, declarator.id.name)?.references ?? [];
}
