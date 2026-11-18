import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { staticKey } from '../security/security-values.mts';
import { nameOf, type SourceCode } from '../typed/node-views.mts';
import {
  identifiersIn,
  isAuthName,
  isBareCallee,
  isCalleeUse,
  isFunctionNode,
  reachedVariables,
  scopeContains,
  variableOf,
  type Variable,
} from './scope-names.mts';

export type QueryParts = {
  readonly key: TSESTree.ArrayExpression;
  readonly queryFn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
};

const STABLE_HOOKS = new Set([
  'useRef',
  'useCallback',
  'useQueryClient',
  'useDispatch',
  'useStore',
  'useTranslation',
  'useNavigate',
]);
const CONTINUATIONS = new Set(['then', 'catch', 'finally']);
const QUERY_MODULE = /^(@tanstack\/[a-z-]*query|react-query)$/;

export function importsQueryLibrary(program: TSESTree.Program): boolean {
  return program.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      QUERY_MODULE.test(String(statement.source.value)),
  );
}

export function queryParts(object: TSESTree.ObjectExpression): QueryParts | undefined {
  const properties = new Map<string, TSESTree.Node>();
  for (const property of object.properties) {
    if (property.type === AST_NODE_TYPES.SpreadElement) {
      return undefined;
    }
    const name = staticKey(property);
    if (name !== undefined && property.type === AST_NODE_TYPES.Property) {
      properties.set(name, property.value);
    }
  }
  const key = properties.get('queryKey');
  const queryFn = properties.get('queryFn');
  const keyed = key?.type === AST_NODE_TYPES.ArrayExpression;
  const inline =
    queryFn !== undefined && isFunctionNode(queryFn) && queryFn.type !== 'FunctionDeclaration';
  return keyed && inline ? { key, queryFn } : undefined;
}

function initializer(variable: Variable): TSESTree.Node | undefined {
  const definition = variable.defs[0];
  if (definition === undefined || definition.node.type !== AST_NODE_TYPES.VariableDeclarator) {
    return undefined;
  }
  return definition.node.init ?? undefined;
}

function isContinuation(identifier: TSESTree.Identifier): boolean {
  const call = identifier.parent;
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.includes(identifier) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    CONTINUATIONS.has(nameOf(call.callee.property) ?? '')
  );
}

function isIgnoredVariable(variable: Variable, uses: readonly TSESTree.Identifier[]): boolean {
  const definition = variable.defs[0];
  return (
    definition === undefined ||
    definition.type === 'ImportBinding' ||
    definition.type === 'FunctionName' ||
    variable.defs.length > 1 ||
    variable.name === 'queryClient' ||
    isAuthName(variable.name) ||
    uses.every((use) => isBareCallee(use) || isContinuation(use))
  );
}

function isStableInit(
  variable: Variable,
  init: TSESTree.Node,
  uses: readonly TSESTree.Identifier[],
): boolean {
  if (init.type === AST_NODE_TYPES.Literal || isFunctionNode(init)) {
    return true;
  }
  if (init.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = init.callee;
  const hook = callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
  if (hook !== undefined && STABLE_HOOKS.has(hook)) {
    return true;
  }
  return variable.defs[0]?.name.type === AST_NODE_TYPES.Identifier && uses.every(isCalleeUse);
}

function isInputVariable(variable: Variable, uses: readonly TSESTree.Identifier[]): boolean {
  if (isIgnoredVariable(variable, uses)) {
    return false;
  }
  const init = initializer(variable);
  return init === undefined || !isStableInit(variable, init, uses);
}

export function missingQueryInputs(
  sourceCode: SourceCode,
  parts: QueryParts,
  within: TSESLint.Scope.Scope,
): string[] {
  const inKey = new Set([
    ...identifiersIn(parts.key).flatMap((identifier) => variableOf(sourceCode, identifier) ?? []),
    ...reachedVariables(sourceCode, parts.key, within).keys(),
  ]);
  const uses = new Map<Variable, TSESTree.Identifier[]>();
  for (const identifier of identifiersIn(parts.queryFn)) {
    const variable = variableOf(sourceCode, identifier);
    const inside =
      variable !== undefined && scopeContains(sourceCode.getScope(parts.queryFn), variable.scope);
    if (variable === undefined || inside || !scopeContains(within, variable.scope)) {
      continue;
    }
    uses.set(variable, [...(uses.get(variable) ?? []), identifier]);
  }
  return [...uses]
    .filter(([variable, found]) => !inKey.has(variable) && isInputVariable(variable, found))
    .map(([variable]) => variable.name);
}
