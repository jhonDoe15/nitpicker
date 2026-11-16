import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { followedChain } from '../../analysis/globals/value-chain.mts';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

type NameSet = ReadonlySet<string | undefined>;

const queryMethods = new Set<string | undefined>([
  'getElementById',
  'getElementsByClassName',
  'getElementsByName',
  'getElementsByTagName',
  'querySelector',
  'querySelectorAll',
]);
const creationMethods = new Set<string | undefined>(['createElement', 'createElementNS']);
const contentProperties = new Set<string | undefined>([
  'innerHTML',
  'innerText',
  'outerHTML',
  'textContent',
]);
const contentMethods = new Set([
  'createContextualFragment',
  'insertAdjacentHTML',
  'insertAdjacentText',
  'setHTMLUnsafe',
]);
const writeMethods = new Set(['write', 'writeln']);
const attributeMethods = new Set(['setAttribute', 'removeAttribute', 'toggleAttribute']);
const styleMethods = new Set(['setProperty', 'removeProperty']);
const insertionMethods = new Set([
  'after',
  'append',
  'appendChild',
  'before',
  'insertAdjacentElement',
  'insertBefore',
  'prepend',
  'replaceChildren',
  'replaceWith',
]);
const classListMethods = new Set(['add', 'remove', 'toggle', 'replace']);
const globalObjects = new Set(['window', 'globalThis', 'self']);
const documentNames = new Set(['document']);
const pageElements = new Set<string | undefined>(['documentElement', 'body', 'head']);
const changeablePageElements = new Set<string | undefined>(['documentElement', 'body']);
const rootMounts = new Set<string | undefined>(['createRoot', 'hydrateRoot', 'createPortal']);
const uiFile = /(?:^|\/)(?:ui\/|adapters\/|shared\/|lib\/|use(?:[A-Z]|-)[^/]*$)/u;
const MAX_ALIASES = 8;

function propertyName(member: TSESTree.Node): string | undefined {
  return member.type === AST_NODE_TYPES.MemberExpression && !member.computed
    ? nameOf(member.property)
    : undefined;
}

function isNeverReassigned(
  variable: TSESLint.Scope.Variable,
  definition: TSESLint.Scope.Definitions.VariableDefinition,
): boolean {
  return (
    definition.parent.kind === 'const' ||
    variable.references.every((reference) => !reference.isWrite() || reference.init)
  );
}

function constInitOf(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node | undefined {
  const variable =
    node.type === AST_NODE_TYPES.Identifier ? variableNamed(sourceCode, node) : undefined;
  const [definition] = variable?.defs ?? [];
  const isConstant =
    variable?.defs.length === 1 &&
    definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier &&
    isNeverReassigned(variable, definition);
  return isConstant && definition.node.init ? unwrapped(definition.node.init) : undefined;
}

function aliasChain(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node[] {
  return followedChain(
    unwrapped(node),
    (current) => constInitOf(sourceCode, current),
    MAX_ALIASES + 1,
  );
}

function aliasTarget(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node {
  return aliasChain(sourceCode, node).at(-1) ?? node;
}

function isGlobal(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  names: ReadonlySet<string>,
): boolean {
  const target = aliasTarget(sourceCode, node);
  const definitions =
    target.type === AST_NODE_TYPES.Identifier
      ? (variableNamed(sourceCode, target)?.defs ?? [])
      : [];
  return (
    target.type === AST_NODE_TYPES.Identifier && names.has(target.name) && definitions.length === 0
  );
}

function isDocument(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const target = aliasTarget(sourceCode, node);
  if (constInitOf(sourceCode, target) !== undefined) {
    return false;
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return isGlobal(sourceCode, target, documentNames);
  }
  const name = propertyName(target);
  return (
    name === 'ownerDocument' ||
    (name === 'document' &&
      target.type === AST_NODE_TYPES.MemberExpression &&
      isGlobal(sourceCode, target.object, globalObjects))
  );
}

function isDocumentCall(sourceCode: SourceCode, node: TSESTree.Node, methods: NameSet): boolean {
  const call = unwrapped(node);
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    isDocument(sourceCode, call.callee.object) &&
    methods.has(propertyName(call.callee))
  );
}

function pageElementName(sourceCode: SourceCode, node: TSESTree.Node): string | undefined {
  const target = unwrapped(node);
  return target.type === AST_NODE_TYPES.MemberExpression && isDocument(sourceCode, target.object)
    ? propertyName(target)
    : undefined;
}

function isRefElement(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const target = unwrapped(node);
  const alias = constInitOf(sourceCode, target);
  return (
    propertyName(target) === 'current' || (alias !== undefined && propertyName(alias) === 'current')
  );
}

function isPageNode(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return aliasChain(sourceCode, node).some(
    (target) =>
      pageElements.has(pageElementName(sourceCode, target)) ||
      isDocumentCall(sourceCode, target, queryMethods) ||
      isDocumentCall(sourceCode, target, creationMethods),
  );
}

function isChangeable(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return (
    changeablePageElements.has(pageElementName(sourceCode, node)) || isRefElement(sourceCode, node)
  );
}

function isOutsideStyle(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const target = unwrapped(node);
  return (
    target.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(target) === 'style' &&
    !isChangeable(sourceCode, target.object)
  );
}

function isStyleAssign(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  const [first] = call.arguments;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(callee) === 'assign' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Object' &&
    first !== undefined &&
    isOutsideStyle(sourceCode, first)
  );
}

function isClassListChange(sourceCode: SourceCode, name: string, owner: TSESTree.Node): boolean {
  const list = unwrapped(owner);
  return (
    classListMethods.has(name) &&
    list.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(list) === 'classList' &&
    !isChangeable(sourceCode, list.object)
  );
}

function isMethodChange(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  const name = propertyName(callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || name === undefined) {
    return false;
  }
  const owner = callee.object;
  return (
    contentMethods.has(name) ||
    (writeMethods.has(name) && isDocument(sourceCode, owner)) ||
    isStyleAssign(sourceCode, call) ||
    isClassListChange(sourceCode, name, owner) ||
    (styleMethods.has(name) && isOutsideStyle(sourceCode, owner)) ||
    (attributeMethods.has(name) &&
      isPageNode(sourceCode, owner) &&
      !isChangeable(sourceCode, owner)) ||
    (insertionMethods.has(name) &&
      isPageNode(sourceCode, owner) &&
      !isRefElement(sourceCode, owner))
  );
}

function isDomAssignment(sourceCode: SourceCode, left: TSESTree.Node): boolean {
  if (left.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  if (contentProperties.has(propertyName(left))) {
    return true;
  }
  if (propertyName(left) === 'className') {
    return !isChangeable(sourceCode, left.object);
  }
  return isOutsideStyle(sourceCode, left.object);
}

function isRootMount(callee: TSESTree.Node): boolean {
  return rootMounts.has(
    callee.type === AST_NODE_TYPES.Identifier ? callee.name : propertyName(callee),
  );
}

export const rule: TSESLint.RuleModule<'directDom'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow changing the DOM directly from a component',
    },
    schema: [],
    messages: {
      directDom:
        'Do not query or change the page DOM directly: render the value from state or props, render into another node with `createPortal`, and reach an element through a ref (`ref.current.style`, focus, measuring); `document.documentElement` and `document.body` may change their class, style and attributes. An exception fits only for a third-party widget or a file download.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const queries: TSESTree.Node[] = [];
    const changes: TSESTree.Node[] = [];
    let rendersJsx = uiFile.test(context.filename.replaceAll('\\', '/'));
    let mountsRoot = false;

    return {
      JSXElement() {
        rendersJsx = true;
      },
      CallExpression(node: TSESTree.CallExpression) {
        mountsRoot ||= isRootMount(node.callee);
        if (isDocumentCall(sourceCode, node, queryMethods)) {
          queries.push(node);
        }
        if (isMethodChange(sourceCode, node)) {
          changes.push(node);
        }
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (isDomAssignment(sourceCode, node.left)) {
          changes.push(node);
        }
      },
      'Program:exit'() {
        if (rendersJsx) {
          for (const node of mountsRoot ? changes : [...queries, ...changes]) {
            context.report({ node, messageId: 'directDom' });
          }
        }
      },
    };
  },
};
