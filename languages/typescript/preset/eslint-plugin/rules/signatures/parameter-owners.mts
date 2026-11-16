import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, variableNamed, type Ranged, type SourceCode } from '../typed/node-views.mts';
import {
  isExportedStatement,
  isFunction,
  TYPE_ASSERTIONS,
  unwrapOf,
  wrappedExpression,
  type FunctionNode,
} from '../typed/syntax-views.mts';
import { calleeName, isFreshContainer, isReassignedToCopy } from './parameter-copies.mts';

type Variable = TSESLint.Scope.Variable;
type CrossesProperty = (member: TSESTree.MemberExpression) => boolean;
type Walk = { readonly sourceCode: SourceCode; readonly crossesProperty: CrossesProperty };

const { DefinitionType } = TSESLint.Scope;

const DRAFT_CALLEES = new Set<string | undefined>([
  'produce',
  'produceWithPatches',
  'createSlice',
  'createReducer',
  'useImmer',
  'useImmerReducer',
]);
const ASSERTIONS = [...TYPE_ASSERTIONS, AST_NODE_TYPES.TSNonNullExpression];
const ACCUMULATING_CALLEES = new Set<string | undefined>(['reduce', 'reduceRight']);

export function withoutAssertion(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, ASSERTIONS);
}

function chainStep(
  node: TSESTree.Node,
  crossesProperty: CrossesProperty,
): TSESTree.Node | undefined {
  const inner = wrappedExpression(node, ASSERTIONS);
  if (inner !== undefined) {
    return inner;
  }
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  return node.computed || crossesProperty(node) ? node.object : undefined;
}

function chainRoot(
  node: TSESTree.Node,
  crossesProperty: CrossesProperty,
): TSESTree.Identifier | undefined {
  const chain = [node];
  for (const current of chain) {
    const next = chainStep(current, crossesProperty);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const root = chain.at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root : undefined;
}

function aliasSource(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const chain = [node];
  for (const current of chain) {
    const inner = withoutAssertion(current);
    if (inner.type === AST_NODE_TYPES.LogicalExpression && ['??', '||'].includes(inner.operator)) {
      chain.push(inner.left);
    }
  }
  const source = withoutAssertion(chain.at(-1) ?? node);
  return source.type === AST_NODE_TYPES.Identifier ? source : undefined;
}

function aliasedVariable(sourceCode: SourceCode, variable: Variable): Variable | undefined {
  const definition = variable.defs.at(0);
  const declarator = definition?.type === DefinitionType.Variable ? definition.node : undefined;
  const fixed = variable.references.every((reference) => !reference.isWrite() || reference.init);
  const source =
    declarator?.id.type === AST_NODE_TYPES.Identifier && declarator.init !== null && fixed
      ? aliasSource(declarator.init)
      : undefined;
  return source === undefined ? undefined : variableNamed(sourceCode, source);
}

function aliasedParameter(sourceCode: SourceCode, variable: Variable): Variable | undefined {
  const seen = [variable];
  for (const current of seen) {
    const next = aliasedVariable(sourceCode, current);
    if (next !== undefined && !seen.includes(next)) {
      seen.push(next);
    }
  }
  return seen.at(-1);
}

function isNamedReducer(sourceCode: SourceCode, owner: TSESTree.FunctionDeclaration): boolean {
  const [variable] = sourceCode.getDeclaredVariables(owner);
  return (
    variable?.references.some(({ identifier }) => {
      const call = identifier.parent;
      return (
        call.type === AST_NODE_TYPES.CallExpression &&
        call.arguments[0] === identifier &&
        ACCUMULATING_CALLEES.has(calleeName(call))
      );
    }) === true
  );
}

function isAccumulator(
  sourceCode: SourceCode,
  owner: FunctionNode,
  name: TSESTree.BindingName,
): boolean {
  const call = owner.parent;
  const [first] = owner.params;
  const firstName = first?.type === AST_NODE_TYPES.AssignmentPattern ? first.left : first;
  const initial = name.parent;
  const defaulted =
    initial.type === AST_NODE_TYPES.AssignmentPattern && isFreshContainer(initial.right);
  const inlineReducer =
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === owner) &&
    ACCUMULATING_CALLEES.has(calleeName(call)) &&
    firstName === name;
  const namedReducer =
    firstName === name &&
    owner.type === AST_NODE_TYPES.FunctionDeclaration &&
    isNamedReducer(sourceCode, owner);
  return defaulted || inlineReducer || namedReducer;
}

function isDraft(owner: FunctionNode): boolean {
  return ancestorsOf(owner).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.CallExpression && DRAFT_CALLEES.has(calleeName(ancestor)),
  );
}

function isPrivateMember(owner: FunctionNode): boolean {
  const member = owner.parent;
  return (
    (member.type === AST_NODE_TYPES.MethodDefinition ||
      member.type === AST_NODE_TYPES.PropertyDefinition) &&
    (member.accessibility === 'private' || member.key.type === AST_NODE_TYPES.PrivateIdentifier)
  );
}

function isInternalFunction(owner: FunctionNode): boolean {
  const ancestors = ancestorsOf(owner);
  const nested = ancestors.some(isFunction);
  const statement = ancestors.find((ancestor) => ancestor.parent?.type === AST_NODE_TYPES.Program);
  const program = statement?.parent;
  return (
    nested ||
    isPrivateMember(owner) ||
    statement === undefined ||
    !isExportedStatement(program, statement)
  );
}

export function changedParameter(
  walk: Walk,
  target: TSESTree.Node,
  mutation: Ranged,
): TSESLint.Scope.Definitions.ParameterDefinition | undefined {
  const { sourceCode, crossesProperty } = walk;
  const root = chainRoot(target, crossesProperty);
  const named = root === undefined ? undefined : variableNamed(sourceCode, root);
  const variable = named === undefined ? undefined : aliasedParameter(sourceCode, named);
  const definition = variable?.defs.at(0);
  if (
    variable === undefined ||
    definition?.type !== DefinitionType.Parameter ||
    !isFunction(definition.node) ||
    definition.name.parent.type === AST_NODE_TYPES.RestElement
  ) {
    return undefined;
  }
  const owner = definition.node;
  const exempt =
    isInternalFunction(owner) ||
    isAccumulator(sourceCode, owner, definition.name) ||
    isDraft(owner) ||
    isReassignedToCopy(variable, mutation);
  return exempt ? undefined : definition;
}
