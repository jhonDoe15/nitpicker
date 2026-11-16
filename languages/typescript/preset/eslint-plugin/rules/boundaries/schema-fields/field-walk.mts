import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { constantInitializer, nameOf, type SourceCode } from '../../typed/node-views.mts';
import {
  calledExport,
  chainLibrary,
  exportOf,
  propertyName,
  type SchemaLibrary,
} from './library-nodes.mts';
import { isNonValidatingMethod, type LooseForm } from './schema-forms.mts';

const MAX_ALIAS_DEPTH = 3;

type MethodCall = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };
type Leaf = { readonly library: SchemaLibrary; readonly display: string; readonly cast?: true };
type LooseMatch = { readonly form: LooseForm; readonly library: SchemaLibrary };
type Walk = { readonly depth: number; readonly owner: SchemaLibrary | undefined };

function isStaticProperty(entry: TSESTree.ObjectLiteralElement): entry is TSESTree.Property {
  return entry.type === AST_NODE_TYPES.Property && !entry.computed;
}

function isMethodCall(sourceCode: SourceCode, node: TSESTree.Node): node is MethodCall {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    calledExport(sourceCode, node) === undefined
  );
}

function withoutNonValidatingCalls(
  sourceCode: SourceCode,
  expression: TSESTree.Node,
): TSESTree.Node {
  const pending = [expression];
  for (const current of pending) {
    if (isMethodCall(sourceCode, current) && isNonValidatingMethod(propertyName(current.callee))) {
      pending.push(current.callee.object);
    }
  }
  return pending.at(-1) ?? expression;
}

function callLeaf(sourceCode: SourceCode, node: TSESTree.CallExpression): Leaf | undefined {
  const called = calledExport(sourceCode, node);
  if (called === undefined) {
    return undefined;
  }
  const { forms } = called.library;
  const leaf = forms.leaves[called.name];
  if (leaf?.kind === 'call' && (!leaf.noArguments || node.arguments.length === 0)) {
    return { library: called.library, display: leaf.display };
  }
  return forms.casts.includes(called.name) && node.arguments.length === 0
    ? {
        library: called.library,
        display: `${forms.namespaces[0] ?? ''}.${called.name}()`,
        cast: true,
      }
    : undefined;
}

function valueLeaf(sourceCode: SourceCode, node: TSESTree.Node): Leaf | undefined {
  const exported = exportOf(sourceCode, node);
  if (exported === undefined) {
    return undefined;
  }
  const leaf = exported.library.forms.leaves[exported.name];
  return leaf?.kind === 'value' ? { library: exported.library, display: leaf.display } : undefined;
}

function stringLeaf(node: TSESTree.Node, owner: SchemaLibrary | undefined): Leaf | undefined {
  const pattern = owner?.forms.stringLeaves;
  return owner !== undefined &&
    pattern !== undefined &&
    node.type === AST_NODE_TYPES.Literal &&
    typeof node.value === 'string' &&
    pattern.test(node.value)
    ? { library: owner, display: JSON.stringify(node.value.trim()) }
    : undefined;
}

function unvalidatedLeaf(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  owner: SchemaLibrary | undefined,
): Leaf | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callLeaf(sourceCode, node);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression || node.type === AST_NODE_TYPES.Identifier) {
    return valueLeaf(sourceCode, node);
  }
  return stringLeaf(node, owner);
}

function recordValue(argument: TSESTree.Node | undefined): TSESTree.Node[] {
  const property =
    argument?.type === AST_NODE_TYPES.ObjectExpression
      ? argument.properties.filter(isStaticProperty).find((entry) => nameOf(entry.key) === 'value')
      : undefined;
  return property === undefined ? [] : [property.value];
}

function containerChildren(
  sourceCode: SourceCode,
  root: TSESTree.Node,
): TSESTree.Node[] | undefined {
  const called = calledExport(sourceCode, root);
  if (
    root.type !== AST_NODE_TYPES.CallExpression ||
    called === undefined ||
    !called.library.forms.containers.includes(called.name)
  ) {
    return undefined;
  }
  return called.library.forms.containerChildren[called.name] === 'value'
    ? recordValue(root.arguments[0])
    : root.arguments;
}

function elementChildren(sourceCode: SourceCode, root: TSESTree.Node): TSESTree.Node[] {
  if (!isMethodCall(sourceCode, root)) {
    return [];
  }
  const method = propertyName(root.callee);
  const mode =
    method === undefined ? undefined : chainLibrary(sourceCode, root)?.forms.elementMethods[method];
  if (mode === 'receiver' && root.arguments.length === 0) {
    return [root.callee.object];
  }
  return mode === 'arguments' ? root.arguments : [];
}

function nestedSchemas(
  sourceCode: SourceCode,
  root: TSESTree.Node,
  { depth, owner }: Walk,
): TSESTree.Node[] {
  if (root.type === AST_NODE_TYPES.Identifier) {
    const initializer = depth < MAX_ALIAS_DEPTH ? constantInitializer(sourceCode, root) : undefined;
    return initializer ? [initializer] : [];
  }
  if (root.type === AST_NODE_TYPES.ArrayExpression) {
    const isTuple = owner?.forms.stringLeaves === undefined;
    return isTuple ? root.elements.filter((element) => element !== null) : [];
  }
  return containerChildren(sourceCode, root) ?? elementChildren(sourceCode, root);
}

export function unvalidatedRoot(
  sourceCode: SourceCode,
  expression: TSESTree.Node | undefined,
  owner?: SchemaLibrary,
): Leaf | undefined {
  const pending: { node: TSESTree.Node; depth: number }[] =
    expression === undefined ? [] : [{ node: expression, depth: 0 }];
  for (const { node, depth } of pending) {
    const root = withoutNonValidatingCalls(sourceCode, node);
    const leaf = unvalidatedLeaf(sourceCode, root, owner);
    if (leaf !== undefined) {
      return leaf;
    }
    const children = nestedSchemas(sourceCode, root, { depth, owner });
    pending.push(...children.map((child) => ({ node: child, depth: depth + 1 })));
  }
  return undefined;
}

function optionValue(argument: TSESTree.Node | undefined, key: string): TSESTree.Node | undefined {
  if (argument?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  return argument.properties
    .filter(isStaticProperty)
    .find(
      (entry) =>
        nameOf(entry.key) === key ||
        (entry.key.type === AST_NODE_TYPES.Literal && entry.key.value === key),
    )?.value;
}

function isLooseOption(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  [index, key]: readonly [number, string],
): boolean {
  const option = optionValue(call.arguments[index], key);
  if (option === undefined) {
    return false;
  }
  if (option.type === AST_NODE_TYPES.Literal) {
    return option.value === true;
  }
  return unvalidatedRoot(sourceCode, option) !== undefined;
}

function restArguments(
  call: TSESTree.CallExpression,
  rest: number | 'tail',
): (TSESTree.Node | undefined)[] {
  if (rest !== 'tail') {
    return [call.arguments[rest]];
  }
  return call.arguments
    .slice(1)
    .flatMap((argument) =>
      argument.type === AST_NODE_TYPES.ObjectExpression ? recordValue(argument) : [argument],
    );
}

function matchesLooseForm(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  form: LooseForm,
): boolean {
  const first = call.arguments[0];
  if (form.unlessFalse && first?.type === AST_NODE_TYPES.Literal) {
    return first.value !== false;
  }
  if (form.rest !== undefined) {
    return restArguments(call, form.rest).some(
      (argument) => unvalidatedRoot(sourceCode, argument) !== undefined,
    );
  }
  return form.option === undefined || isLooseOption(sourceCode, call, form.option);
}

function looseCandidates(sourceCode: SourceCode, call: TSESTree.CallExpression): LooseMatch[] {
  const called = calledExport(sourceCode, call);
  if (called !== undefined) {
    return called.library.forms.loose
      .filter((form) => form.factory === called.name)
      .map((form) => ({ form, library: called.library }));
  }
  if (call.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return [];
  }
  const method = propertyName(call.callee);
  const library = method === undefined ? undefined : chainLibrary(sourceCode, call.callee.object);
  if (library === undefined) {
    return [];
  }
  return library.forms.loose
    .filter((form) => form.method === method)
    .map((form) => ({ form, library }));
}

export function looseForm(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): LooseMatch | undefined {
  return looseCandidates(sourceCode, call).find(({ form }) =>
    matchesLooseForm(sourceCode, call, form),
  );
}
