import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf, type SourceCode } from '../../typed/node-views.mts';
import { childrenOf } from '../scope/close-owners.mts';
import { isCloseName, type FunctionNode, functionName } from '../scope/close-scopes.mts';
import { calleeProperty, callsIn, enclosingMethod } from '../shared/scopes.mts';

const STORE_TYPE = /\b(DisposableStore|CompositeDisposable|DisposableCollection)\b/u;
const CREATED_BY = /^(on[A-Z]|toDisposable$|addDisposableListener$)/u;
const RELEASING = new Set<string>(['clear', 'delete', 'deleteAndLeak', 'remove']);
const RELEASES = new Set<string>([
  'dispose',
  'clear',
  'off',
  'removeListener',
  'removeAllListeners',
]);

export type Registration = {
  readonly store: string;
  readonly label: string;
  readonly argument: TSESTree.Node;
};

function thisField(node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.ThisExpression
    ? nameOf(node.property)
    : undefined;
}

function isStoreField(
  classBody: TSESTree.ClassBody,
  field: string,
  sourceCode: SourceCode,
): boolean {
  return classBody.body.some(
    (member) =>
      member.type === AST_NODE_TYPES.PropertyDefinition &&
      nameOf(member.key) === field &&
      STORE_TYPE.test(sourceCode.getText(member)),
  );
}

export function createdInCall(argument: TSESTree.Node | undefined): boolean {
  if (argument === undefined) {
    return false;
  }
  if (argument.type === AST_NODE_TYPES.NewExpression) {
    return true;
  }
  return (
    argument.type === AST_NODE_TYPES.CallExpression &&
    CREATED_BY.test(calleeProperty(argument) ?? '')
  );
}

export function registrationOf(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  classBody: TSESTree.ClassBody,
): Registration | undefined {
  const { callee } = call;
  const [argument] = call.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !createdInCall(argument)
  ) {
    return undefined;
  }
  if (thisField(callee) === '_register' && argument !== undefined) {
    return { store: 'this._register', label: 'this._register(...)', argument };
  }
  const field = thisField(callee.object);
  return field !== undefined &&
    nameOf(callee.property) === 'add' &&
    argument !== undefined &&
    isStoreField(classBody, field, sourceCode)
    ? { store: `this.${field}`, label: `this.${field}.add(...)`, argument }
    : undefined;
}

export function assignedField(call: TSESTree.CallExpression): string | undefined {
  const { parent } = call;
  return parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === call
    ? thisField(parent.left)
    : undefined;
}

function mentionsField(root: TSESTree.Node, field: string): boolean {
  return [...depthFirst(root, childrenOf)].some((node) => thisField(node) === field);
}

export function replacesPrevious(call: TSESTree.CallExpression, method: TSESTree.Node): boolean {
  const field = assignedField(call);
  if (field === undefined) {
    return false;
  }
  const guarded = ancestorsOf(call).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.IfStatement && mentionsField(ancestor.test, field),
  );
  return (
    guarded ||
    callsIn(method).some(
      (other) =>
        RELEASES.has(calleeProperty(other) ?? '') &&
        other.callee.type === AST_NODE_TYPES.MemberExpression &&
        mentionsField(other.callee.object, field),
    )
  );
}

function storeTexts(registration: Registration): readonly string[] {
  return registration.store === 'this._register' ? ['this._store'] : [registration.store];
}

function releasesStore(
  call: TSESTree.CallExpression,
  texts: readonly string[],
  sourceCode: SourceCode,
): boolean {
  return (
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    texts.includes(sourceCode.getText(call.callee.object)) &&
    RELEASING.has(calleeProperty(call) ?? '')
  );
}

export function removesItself(registration: Registration, sourceCode: SourceCode): boolean {
  const texts = storeTexts(registration);
  return callsIn(registration.argument).some((call) => releasesStore(call, texts, sourceCode));
}

export function clearsStore(
  registration: Registration,
  classBody: TSESTree.ClassBody,
  sourceCode: SourceCode,
): boolean {
  const texts = storeTexts(registration);
  return callsIn(classBody).some((other) => {
    const method = enclosingMethod(other);
    const closing = isCloseName(method && functionName(method));
    return (
      releasesStore(other, texts, sourceCode) ||
      (calleeProperty(other) === 'dispose' &&
        !closing &&
        other.callee.type === AST_NODE_TYPES.MemberExpression &&
        texts.includes(sourceCode.getText(other.callee.object)))
    );
  });
}

function assignedFields(method: FunctionNode): Set<string> {
  const fields = new Set<string>();
  for (const node of depthFirst(method.body, childrenOf)) {
    const field =
      node.type === AST_NODE_TYPES.AssignmentExpression ? thisField(node.left) : undefined;
    if (field !== undefined) {
      fields.add(field);
    }
  }
  return fields;
}

function checkedFields(method: FunctionNode): Set<string> {
  const tests = [...depthFirst(method.body, childrenOf)].filter(
    (node) => node.type === AST_NODE_TYPES.IfStatement,
  );
  const nodes = tests.flatMap((node) => [...depthFirst(node.test, childrenOf)]);
  return new Set(nodes.flatMap((node) => thisField(node) ?? []));
}

export function isLazyInit(method: FunctionNode): boolean {
  const checked = checkedFields(method);
  return [...assignedFields(method)].some((field) => checked.has(field));
}
