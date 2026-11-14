import ts from 'typescript';
import type { ExtractContext, Unsupported } from '../model/syntax-types.mts';
import { depthFirst } from '../model/traversal.mts';
import { declarationOf, isAssignmentOperator, locationOf } from '../extract/program.mts';

const STEPS = new Set<ts.SyntaxKind>([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken]);

type Mutation =
  ts.BinaryExpression | ts.PrefixUnaryExpression | ts.PostfixUnaryExpression | ts.DeleteExpression;

function childrenOf(node: ts.Node): readonly ts.Node[] {
  return node.getChildren();
}

function isCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)
  );
}

function isAssignment(node: ts.Node): node is ts.BinaryExpression {
  return ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind);
}

function isMutation(node: ts.Node): node is Mutation {
  const steps =
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    STEPS.has(node.operator);
  return isAssignment(node) || steps || ts.isDeleteExpression(node);
}

function mutationTarget(node: Mutation): ts.Node {
  if (isAssignment(node)) {
    return node.left;
  }
  return ts.isDeleteExpression(node) ? node.expression : node.operand;
}

function targetsOf(node: Mutation): readonly ts.Identifier[] {
  const target = mutationTarget(node);
  if (isAssignment(node)) {
    return depthFirst<ts.Node>(target, childrenOf).filter((item) => ts.isIdentifier(item));
  }
  return ts.isIdentifier(target) ? [target] : [];
}

function clobberOf(identifier: ts.Identifier, cx: ExtractContext): string | undefined {
  const declaration = declarationOf(cx.checker, identifier);
  if (declaration === undefined) {
    return undefined;
  }
  const param = cx.params.get(declaration);
  if (param?.kind === 'param') {
    return `param:${String(param.index)}`;
  }
  const local = cx.locals.get(declaration);
  return local === undefined ? undefined : `local:${local.id}`;
}

function writesField(node: Mutation): boolean {
  return depthFirst<ts.Node>(mutationTarget(node), childrenOf).some(
    (item) => ts.isPropertyAccessExpression(item) || ts.isElementAccessExpression(item),
  );
}

export function effectsOf(
  node: ts.Node,
  cx: ExtractContext,
): Pick<Unsupported, 'hasCall' | 'mutates' | 'clobbers'> & { readonly writesFields: boolean } {
  const nodes = depthFirst<ts.Node>(node, childrenOf);
  const mutations = nodes.filter(isMutation);
  const clobbers = mutations.flatMap(targetsOf).map((identifier) => clobberOf(identifier, cx));
  return {
    hasCall: nodes.some(isCall),
    mutates: mutations.length > 0,
    writesFields: mutations.some(writesField),
    clobbers: [...new Set(clobbers.filter((item) => item !== undefined))].sort(),
  };
}

export function unsupported(
  node: ts.Node,
  cx: ExtractContext,
  syntax: string = ts.SyntaxKind[node.kind] ?? '',
): Unsupported {
  return {
    kind: 'unsupported',
    syntax,
    ...effectsOf(node, cx),
    loc: locationOf(cx.sourceFile, node),
  };
}
