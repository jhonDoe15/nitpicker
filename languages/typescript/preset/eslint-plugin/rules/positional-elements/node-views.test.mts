import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { compositeOperands, nameText, soleBodyValue, unwrapAwait } from '../typed/node-views.mts';

function isProgram(value: unknown): value is TSESTree.Program {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'Program' &&
    'body' in value &&
    Array.isArray(value.body)
  );
}

function isStringLiteral(node: TSESTree.Node): node is TSESTree.StringLiteral {
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string';
}

function statementOf(code: string): TSESTree.ProgramStatement {
  const result: unknown = tseslint.parser.parseForESLint(code);
  if (typeof result === 'object' && result !== null && 'ast' in result && isProgram(result.ast)) {
    const [first] = result.ast.body;
    if (first !== undefined) {
      return first;
    }
  }
  throw new TypeError('The parser did not return a statement.');
}

function expressionOf(code: string): TSESTree.Expression {
  const statement = statementOf(code);
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) {
    throw new TypeError('Expected an expression statement.');
  }
  return statement.expression;
}

function functionOf(code: string): TSESTree.FunctionDeclaration {
  const statement = statementOf(code);
  if (statement.type !== AST_NODE_TYPES.FunctionDeclaration) {
    throw new TypeError('Expected a function declaration.');
  }
  return statement;
}

describe('soleBodyValue', () => {
  it('returns an expression body as it is', () => {
    const arrow = expressionOf('(() => 1)');
    expect(arrow.type).toBe(AST_NODE_TYPES.ArrowFunctionExpression);
    if (arrow.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      expect(soleBodyValue(arrow, 'ReturnStatement')).toBe(arrow.body);
    }
  });

  it('returns the value of a single matching statement', () => {
    expect(soleBodyValue(functionOf('function f() { return 1; }'), 'ReturnStatement')?.type).toBe(
      AST_NODE_TYPES.Literal,
    );
    expect(soleBodyValue(functionOf('function f() { go(); }'), 'ExpressionStatement')?.type).toBe(
      AST_NODE_TYPES.CallExpression,
    );
  });

  it('returns nothing for other bodies', () => {
    expect(
      soleBodyValue(functionOf('function f() { return; }'), 'ReturnStatement'),
    ).toBeUndefined();
    expect(soleBodyValue(functionOf('function f() { go(); }'), 'ReturnStatement')).toBeUndefined();
    expect(
      soleBodyValue(functionOf('function f() { return 1; }'), 'ExpressionStatement'),
    ).toBeUndefined();
    expect(
      soleBodyValue(functionOf('function f() { if (a) { b(); } }'), 'ReturnStatement'),
    ).toBeUndefined();
    expect(soleBodyValue(functionOf('function f() {}'), 'ReturnStatement')).toBeUndefined();
    expect(
      soleBodyValue(functionOf('function f() { a(); b(); }'), 'ExpressionStatement'),
    ).toBeUndefined();
  });
});

describe('compositeOperands', () => {
  it('lists template expressions and binary operands', () => {
    expect(compositeOperands(expressionOf('`${a}-${b}`'))).toHaveLength(2);
    expect(compositeOperands(expressionOf('a + b'))).toHaveLength(2);
    expect(compositeOperands(expressionOf('a'))).toBeUndefined();
  });
});

describe('nameText', () => {
  it('reads identifier names and string literal values', () => {
    const identifier = expressionOf('name');
    const literal = expressionOf("'quoted'");
    if (identifier.type === AST_NODE_TYPES.Identifier && isStringLiteral(literal)) {
      expect(nameText(identifier)).toBe('name');
      expect(nameText(literal)).toBe('quoted');
    }
  });
});

describe('unwrapAwait', () => {
  it('unwraps an await and keeps anything else', () => {
    const awaited = expressionOf('await load()');
    expect(unwrapAwait(awaited)?.type).toBe(AST_NODE_TYPES.CallExpression);
    const plain = expressionOf('load()');
    expect(unwrapAwait(plain)).toBe(plain);
    expect(unwrapAwait(undefined)).toBeUndefined();
  });
});
