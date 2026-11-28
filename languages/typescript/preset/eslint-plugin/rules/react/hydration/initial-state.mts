import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, type FileContext } from '../../typed/node-views.mts';
import { nodesOutsideNestedFunctions } from '../react-effects.mts';
import { calleeNameOf, isFunction } from '../../typed/syntax-views.mts';
import { enclosingComponent } from '../support/component-names.mts';
import { testsBrowser } from './browser-tests.mts';

export type BrowserInitialValue = {
  readonly initializer: TSESTree.Node;
  readonly name: string;
};

const LAZY_ONLY = new Set(['useMemo']);
const INITIALIZERS = new Set(['useState', ...LAZY_ONLY]);

export function inComponentRender(node: TSESTree.Node): boolean {
  const component = enclosingComponent(node);
  const nearest = ancestorsOf(node).find(isFunction);
  return component !== undefined && nearest === component.fn;
}

export function suppressed(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.JSXElement &&
      ancestor.openingElement.attributes.some(
        (attribute) =>
          attribute.type === AST_NODE_TYPES.JSXAttribute &&
          attribute.name.name === 'suppressHydrationWarning',
      ),
  );
}

function stateBinding(
  call: TSESTree.CallExpression,
  hook: string,
): TSESTree.Identifier | undefined {
  const { parent } = call;
  if (parent.type !== AST_NODE_TYPES.VariableDeclarator) {
    return undefined;
  }
  const { id } = parent;
  if (LAZY_ONLY.has(hook)) {
    return id.type === AST_NODE_TYPES.Identifier ? id : undefined;
  }
  const [first] = id.type === AST_NODE_TYPES.ArrayPattern ? id.elements : [];
  return first?.type === AST_NODE_TYPES.Identifier ? first : undefined;
}

function intrinsicAttribute(attribute: TSESTree.JSXAttribute): boolean {
  const element = attribute.parent;
  const name = attribute.name.type === AST_NODE_TYPES.JSXIdentifier ? attribute.name.name : '';
  return (
    element.name.type === AST_NODE_TYPES.JSXIdentifier &&
    /^[a-z]/u.test(element.name.name) &&
    !/^on[A-Z]/u.test(name) &&
    name !== 'key' &&
    name !== 'ref'
  );
}

function inMarkup(identifier: TSESTree.Node): boolean {
  const container = ancestorsOf(identifier).find(
    (ancestor) => ancestor.type === AST_NODE_TYPES.JSXExpressionContainer,
  );
  const holder = container?.parent;
  return (
    holder?.type === AST_NODE_TYPES.JSXElement ||
    holder?.type === AST_NODE_TYPES.JSXFragment ||
    (holder?.type === AST_NODE_TYPES.JSXAttribute && intrinsicAttribute(holder))
  );
}

function renderedReference(reference: TSESLint.Scope.Reference, fn: TSESTree.Node): boolean {
  const { identifier } = reference;
  const nearest = ancestorsOf(identifier).find(isFunction);
  return nearest === fn && inMarkup(identifier) && !suppressed(identifier);
}

function isRendered(
  binding: TSESTree.Identifier,
  call: TSESTree.CallExpression,
  context: FileContext,
): boolean {
  const fn = enclosingComponent(binding)?.fn;
  return (
    fn !== undefined &&
    context.sourceCode
      .getDeclaredVariables(call.parent)
      .filter((each) => each.name === binding.name)
      .some((variable) => variable.references.some((reference) => renderedReference(reference, fn)))
  );
}

function returns(node: TSESTree.Node): boolean {
  return nodesOutsideNestedFunctions(node).some(
    (each) => each.type === AST_NODE_TYPES.ReturnStatement,
  );
}

function decidingParts(initializer: TSESTree.Node): TSESTree.Node[] {
  if (!isFunction(initializer)) {
    return [initializer];
  }
  const { body } = initializer;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return [body];
  }
  return nodesOutsideNestedFunctions(body).flatMap((node) => {
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      return node.argument ? [node.argument] : [];
    }
    return node.type === AST_NODE_TYPES.IfStatement && returns(node.consequent) ? [node.test] : [];
  });
}

function decidedByBrowser(initializer: TSESTree.Node, context: FileContext): boolean {
  return decidingParts(initializer).some((part) => testsBrowser(part, context));
}

function candidateBinding(
  call: TSESTree.CallExpression,
  hook: string,
  initializer: TSESTree.Node,
): TSESTree.Identifier | undefined {
  if (
    !INITIALIZERS.has(hook) ||
    (LAZY_ONLY.has(hook) && !isFunction(initializer)) ||
    !inComponentRender(call)
  ) {
    return undefined;
  }
  return stateBinding(call, hook);
}

export function browserInitialValue(
  call: TSESTree.CallExpression,
  context: FileContext,
): BrowserInitialValue | undefined {
  const hook = calleeNameOf(call.callee) ?? '';
  const [initializer] = call.arguments;
  const binding = initializer === undefined ? undefined : candidateBinding(call, hook, initializer);
  if (
    initializer === undefined ||
    binding === undefined ||
    !decidedByBrowser(initializer, context) ||
    !isRendered(binding, call, context)
  ) {
    return undefined;
  }
  return { initializer, name: binding.name };
}
