import type { Node } from 'web-tree-sitter';
import type { Span } from '../../../extract-types.mts';
import { codeParts, descendants, field, hasAncestorIn, present, squashed } from '../../syntax.mts';
import {
  bodyOf,
  declaredNames,
  isInLoop,
  isJump,
  isTypeNode,
  literalTypeOf,
  localDeclarationProblem,
  parameterNodes,
  parameterType,
} from '../syntax.mts';

export type Run = {
  readonly fn: Node;
  readonly block: Node;
  readonly before: readonly Node[];
  readonly statements: readonly Node[];
  readonly after: readonly Node[];
};

const LAMBDAS = new Set(['lambda_literal']);
const SMART_CAST =
  /\bis\b|[!=]=\s*null|\bas\b|isNullOr(?:Empty|Blank)|(?:require|check)NotNull|\?:\s*(?:return|throw)/u;

export function runOf(fn: Node, span: Span): Run | undefined {
  const block = codeParts(bodyOf(fn))[0];
  if (block?.type !== 'block') {
    return undefined;
  }
  const all = codeParts(block).filter(({ type }) => type !== '{' && type !== '}');
  const from = all.findIndex(({ startPosition }) => startPosition.row + 1 === span.start);
  const to = all.findIndex(({ endPosition }) => endPosition.row + 1 === span.end);
  return from < 0 || to < from
    ? undefined
    : {
        fn,
        block,
        before: all.slice(0, from),
        statements: all.slice(from, to + 1),
        after: all.slice(to + 1),
      };
}

export function insideNames({ statements }: Run): Set<string> {
  return new Set(statements.flatMap((statement) => [...declaredNames(statement)]));
}

function strays(node: Node, block: Node): boolean {
  if (node.type === 'return_expression') {
    return field(node, 'label') === undefined || !hasAncestorIn(node, block, LAMBDAS);
  }
  return isJump(node) && !isInLoop(node, block);
}

export function flowProblem({ statements, block }: Run): string | undefined {
  const declared = statements.map(localDeclarationProblem).find((found) => found !== undefined);
  if (declared !== undefined) {
    return declared;
  }
  const nodes = statements.flatMap((statement) => descendants(statement));
  return nodes.some((node) => strays(node, block))
    ? 'the run returns, breaks or continues out of itself'
    : undefined;
}

export function typeFromDeclaration(declaration: Node): string | undefined {
  if (declaration.type !== 'property_declaration') {
    return undefined;
  }
  const parts = codeParts(declaration);
  const variable = parts.find(({ type }) => type === 'variable_declaration');
  if (variable === undefined || parts.some(({ type }) => type === 'property_delegate')) {
    return undefined;
  }
  const annotated = codeParts(variable).find(isTypeNode);
  if (annotated !== undefined) {
    return squashed(annotated);
  }
  const value = parts.at(-1);
  return value === undefined || value.id === variable.id ? undefined : literalTypeOf(value);
}

function nameOfDeclaration(declaration: Node): string | undefined {
  const variable = codeParts(declaration).find(({ type }) => type === 'variable_declaration');
  return variable === undefined ? undefined : codeParts(variable)[0]?.text;
}

export function outsideType({ fn, before }: Run, name: string): string | undefined {
  const parameter = parameterNodes(fn).find((node) => present(codeParts(node)[0]).text === name);
  if (parameter !== undefined) {
    return parameterType(parameter);
  }
  const declaration = before.find(
    (statement) =>
      statement.type === 'property_declaration' && nameOfDeclaration(statement) === name,
  );
  return declaration === undefined ? undefined : typeFromDeclaration(declaration);
}

export function smartCastRisk({ before }: Run): boolean {
  return before.some(({ text }) => SMART_CAST.test(text));
}
