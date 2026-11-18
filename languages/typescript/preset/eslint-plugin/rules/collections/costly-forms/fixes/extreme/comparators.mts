import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../../../typed/node-views.mts';
import { operandsOf } from '../../../../typed/syntax-views.mts';
import { memberName, someNode, unwrapped } from '../../repeated-runs.mts';

export type Comparator = {
  readonly candidate: string;
  readonly best: string;
  readonly less: string;
};

type Parameters = readonly [string, string];

const NUMERIC_READS = new Set(['getTime', 'valueOf']);

type Step = { readonly text: string; readonly next: TSESTree.Node };

function stepOf(current: TSESTree.Node, outermost: boolean): Step | undefined {
  if (current.type === AST_NODE_TYPES.MemberExpression) {
    const name = current.optional || current.computed ? undefined : memberName(current);
    return name === undefined ? undefined : { text: `.${name}`, next: unwrapped(current.object) };
  }
  const callee =
    current.type === AST_NODE_TYPES.CallExpression ? unwrapped(current.callee) : undefined;
  const name = callee?.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  const plain =
    current.type === AST_NODE_TYPES.CallExpression &&
    current.arguments.length === 0 &&
    !current.optional &&
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    !callee.optional;
  return outermost && plain && name !== undefined && NUMERIC_READS.has(name)
    ? { text: `.${name}()`, next: unwrapped(callee.object) }
    : undefined;
}

function pathKey(node: TSESTree.Node, parameter: string): string | undefined {
  let current = unwrapped(node);
  const steps: string[] = [];
  while (current.type !== AST_NODE_TYPES.Identifier) {
    const step = stepOf(current, steps.length === 0);
    if (step === undefined) {
      return undefined;
    }
    steps.unshift(step.text);
    current = step.next;
  }
  return current.name === parameter ? steps.join('') : undefined;
}

function mirrored(left: TSESTree.Node, right: TSESTree.Node, [first, second]: Parameters): boolean {
  const forward = [pathKey(left, first), pathKey(right, second)];
  const backward = [pathKey(left, second), pathKey(right, first)];
  return [forward, backward].some(
    ([one, other]) => one !== undefined && other !== undefined && one === other,
  );
}

function isOrderTerm(term: TSESTree.Node, parameters: Parameters): boolean {
  const current = unwrapped(term);
  if (current.type === AST_NODE_TYPES.BinaryExpression && current.operator === '-') {
    return mirrored(current.left, current.right, parameters);
  }
  const callee =
    current.type === AST_NODE_TYPES.CallExpression ? unwrapped(current.callee) : undefined;
  const [argument] = current.type === AST_NODE_TYPES.CallExpression ? current.arguments : [];
  return (
    current.type === AST_NODE_TYPES.CallExpression &&
    !current.optional &&
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    !callee.optional &&
    memberName(callee) === 'localeCompare' &&
    current.arguments.length === 1 &&
    argument !== undefined &&
    argument.type !== AST_NODE_TYPES.SpreadElement &&
    mirrored(callee.object, argument, parameters)
  );
}

function soleReturn(body: TSESTree.Node): TSESTree.Node | undefined {
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return body;
  }
  const [only] = body.body;
  return body.body.length === 1 && only?.type === AST_NODE_TYPES.ReturnStatement
    ? (only.argument ?? undefined)
    : undefined;
}

function parametersOf(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
): Parameters | undefined {
  const [first, second] = fn.params;
  return fn.params.length === 2 &&
    !fn.async &&
    first?.type === AST_NODE_TYPES.Identifier &&
    second?.type === AST_NODE_TYPES.Identifier &&
    first.name !== second.name
    ? [first.name, second.name]
    : undefined;
}

function usesThis(fn: TSESTree.Node): boolean {
  return someNode(fn, (node) => node.type === AST_NODE_TYPES.ThisExpression);
}

function orderOf(
  sourceCode: SourceCode,
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
): Comparator | undefined {
  const parameters = parametersOf(fn);
  const body = soleReturn(fn.body);
  if (parameters === undefined || body === undefined || usesThis(fn)) {
    return undefined;
  }
  const terms = operandsOf(unwrapped(body), '||');
  if (!terms.every((term) => isOrderTerm(term, parameters))) {
    return undefined;
  }
  const text = sourceCode.getText(body);
  const grouped = terms.length > 1 ? `(${text})` : text;
  return { candidate: parameters[0], best: parameters[1], less: `${grouped} < 0` };
}

function declaredFunction(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | undefined {
  const definition = variableNamed(sourceCode, identifier)?.defs[0];
  const node = definition?.node;
  if (definition?.type === TSESLint.Scope.DefinitionType.FunctionName) {
    return node?.type === AST_NODE_TYPES.FunctionDeclaration && !node.generator ? node : undefined;
  }
  const init = node?.type === AST_NODE_TYPES.VariableDeclarator ? node.init : undefined;
  return definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    definition.parent?.type === AST_NODE_TYPES.VariableDeclaration &&
    definition.parent.kind === 'const' &&
    init?.type === AST_NODE_TYPES.ArrowFunctionExpression
    ? init
    : undefined;
}

export function inlineComparator(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): Comparator | undefined {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression
    ? orderOf(sourceCode, node)
    : undefined;
}

export function referencedComparator(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): Comparator | undefined {
  const fn = declaredFunction(sourceCode, identifier);
  const parameters = fn === undefined ? undefined : parametersOf(fn);
  if (fn === undefined || parameters === undefined || orderOf(sourceCode, fn) === undefined) {
    return undefined;
  }
  const candidate = identifier.name === 'candidate' ? 'next' : 'candidate';
  const best = identifier.name === 'best' ? 'top' : 'best';
  return { candidate, best, less: `${identifier.name}(${candidate}, ${best}) < 0` };
}
