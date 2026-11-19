import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

export type FunctionLike =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const LIFECYCLE_HOOKS = new Set([
  'componentDidMount',
  'componentDidUpdate',
  'componentWillUnmount',
  'ngOnInit',
  'ngOnDestroy',
  'ngOnChanges',
  'ngAfterViewInit',
  'ngDoCheck',
]);

const HANDLER_NAME = /^(?:on|handle)[A-Z]/;

export function isHookName(name: string): boolean {
  return LIFECYCLE_HOOKS.has(name) || HANDLER_NAME.test(name);
}

function keyName(key: TSESTree.Node, computed: boolean): string | undefined {
  if (computed) {
    return undefined;
  }
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string'
    ? key.value
    : undefined;
}

function assignedName(left: TSESTree.Node): string | undefined {
  if (left.type === AST_NODE_TYPES.Identifier) {
    return left.name;
  }
  return left.type === AST_NODE_TYPES.MemberExpression
    ? keyName(left.property, left.computed)
    : undefined;
}

function memberBindingNames(node: FunctionLike): (string | undefined)[] {
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.MethodDefinition) {
    return parent.kind === 'method' && parent.value === node
      ? [keyName(parent.key, parent.computed)]
      : [];
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    return parent.value === node && parent.kind === 'init'
      ? [keyName(parent.key, parent.computed)]
      : [];
  }
  return parent.type === AST_NODE_TYPES.PropertyDefinition && parent.value === node
    ? [keyName(parent.key, parent.computed)]
    : [];
}

function bindingNames(node: FunctionLike): (string | undefined)[] {
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right === node ? [assignedName(parent.left)] : [];
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent.init === node && parent.id.type === AST_NODE_TYPES.Identifier
      ? [parent.id.name]
      : [];
  }
  return memberBindingNames(node);
}

export function enclosingNames(node: FunctionLike): string[] {
  const own = node.type === AST_NODE_TYPES.ArrowFunctionExpression ? undefined : node.id?.name;
  return [own, ...bindingNames(node)].filter((name): name is string => name !== undefined);
}

export function isAccessorOrConstructor(node: FunctionLike): boolean {
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.MethodDefinition) {
    return parent.kind !== 'method';
  }
  return parent.type === AST_NODE_TYPES.Property && parent.kind !== 'init';
}
