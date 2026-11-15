import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { chainOf } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { moduleOfFile } from '../emitter-creations.mts';
import {
  isChainableMethod,
  isHandlingLibrary,
  isHelperHandlingName,
  isListenMethod,
  isStreamWaiter,
} from '../emitter-modules.mts';

const MAX_DEPTH = 3;

type Target = { readonly name: string; readonly field: boolean };
type Declaration = TypeScript.SignatureDeclaration | TypeScript.JSDocSignature | undefined;
type Item = { readonly declaration: Declaration; readonly index: number; readonly depth: number };
type Outcome = { readonly handled: boolean; readonly next: readonly Item[] };
type CallLike = TypeScript.CallExpression | TypeScript.NewExpression;
type IdentifierParameter = TypeScript.ParameterDeclaration & {
  readonly name: TypeScript.Identifier;
};
type BodiedFunction = TypeScript.FunctionLikeDeclaration & { readonly body: TypeScript.Node };

function chainedReceiver(expression: TypeScript.Expression): TypeScript.Expression {
  return (
    chainOf<TypeScript.Expression>(expression, (current) =>
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      isChainableMethod(current.expression.name.text)
        ? current.expression.expression
        : undefined,
    ).at(-1) ?? expression
  );
}

function tsNameOf(expression: TypeScript.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

function isTarget(node: TypeScript.Node | undefined, target: Target): boolean {
  if (node === undefined) {
    return false;
  }
  if (ts.isIdentifier(node)) {
    return node.text === target.name;
  }
  return (
    target.field &&
    ts.isPropertyAccessExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ThisKeyword &&
    node.name.text === target.name
  );
}

function passes(node: TypeScript.CallExpression, target: Target): boolean {
  const callee = tsNameOf(node.expression);
  if (!isHelperHandlingName(callee)) {
    return false;
  }
  return isStreamWaiter(callee)
    ? node.arguments.some((argument) => isTarget(argument, target))
    : isTarget(node.arguments[0], target);
}

function listens(node: TypeScript.CallExpression, target: Target): boolean {
  const callee = node.expression;
  const event = node.arguments[0];
  return (
    ts.isPropertyAccessExpression(callee) &&
    isListenMethod(callee.name.text) &&
    event !== undefined &&
    ts.isStringLiteralLike(event) &&
    event.text === 'error' &&
    isTarget(chainedReceiver(callee.expression), target)
  );
}

function isCall(node: TypeScript.Node): node is CallLike {
  return ts.isCallExpression(node) || ts.isNewExpression(node);
}

function handlesNode(node: TypeScript.Node, target: Target): boolean {
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
    return isTarget(node.expression, target);
  }
  return ts.isCallExpression(node) && (passes(node, target) || listens(node, target));
}

function delegation(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
  { target, depth }: { readonly target: Target; readonly depth: number },
): Item[] {
  if (!isCall(node)) {
    return [];
  }
  const index = node.arguments?.findIndex((argument) => isTarget(argument, target)) ?? -1;
  return index === -1
    ? []
    : [{ declaration: checker.getResolvedSignature(node)?.declaration, index, depth: depth + 1 }];
}

function inspectBody(
  checker: TypeScript.TypeChecker,
  root: TypeScript.Node,
  scope: { readonly target: Target; readonly depth: number },
): Outcome {
  const pending = [root];
  const next: Item[] = [];
  for (const node of pending) {
    if (handlesNode(node, scope.target)) {
      return { handled: true, next };
    }
    next.push(...delegation(checker, node, scope));
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return { handled: false, next };
}

function isIdentifierParameter(
  parameter: TypeScript.Node | undefined,
): parameter is IdentifierParameter {
  return parameter !== undefined && ts.isParameter(parameter) && ts.isIdentifier(parameter.name);
}

function hasBody(declaration: NonNullable<Declaration>): declaration is BodiedFunction {
  return 'body' in declaration && declaration.body !== undefined;
}

function parameterTarget(
  declaration: BodiedFunction,
  parameter: IdentifierParameter,
): { readonly target: Target; readonly root: TypeScript.Node } {
  const field = ts.isParameterPropertyDeclaration(parameter, declaration);
  return {
    target: { name: parameter.name.text, field },
    root: field ? declaration.parent : declaration.body,
  };
}

function inspect(checker: TypeScript.TypeChecker, { declaration, index, depth }: Item): Outcome {
  if (declaration === undefined) {
    return { handled: false, next: [] };
  }
  const source = declaration.getSourceFile();
  const library = moduleOfFile(source.fileName);
  if (library !== undefined || source.isDeclarationFile) {
    return { handled: isHandlingLibrary(library), next: [] };
  }
  const parameter = declaration.parameters[index];
  const readable = isIdentifierParameter(parameter) && hasBody(declaration);
  if (!readable) {
    return { handled: false, next: [] };
  }
  const { target, root } = parameterTarget(declaration, parameter);
  return inspectBody(checker, root, { target, depth });
}

export function helperOutcome(
  services: ParserServicesWithTypeInformation,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
  index: number,
): 'handled' | 'neutral' {
  const tsCall = services.esTreeNodeToTSNodeMap.get(call);
  const checker = services.program.getTypeChecker();
  const pending: Item[] = [
    { declaration: checker.getResolvedSignature(tsCall)?.declaration, index, depth: 0 },
  ];
  for (const item of pending) {
    const { handled, next } = inspect(checker, item);
    if (handled) {
      return 'handled';
    }
    pending.push(...next.filter((entry) => entry.depth <= MAX_DEPTH));
  }
  return 'neutral';
}
