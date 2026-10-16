import { variableNamed } from '../../analysis/ancestry.mjs';

const queryMethods = new Set([
  'getElementById',
  'getElementsByClassName',
  'getElementsByName',
  'getElementsByTagName',
  'querySelector',
  'querySelectorAll',
]);
const creationMethods = new Set(['createElement', 'createElementNS']);
const contentProperties = new Set(['innerHTML', 'innerText', 'outerHTML', 'textContent']);
const contentMethods = new Set(['insertAdjacentHTML', 'insertAdjacentText']);
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
const pageElements = new Set(['documentElement', 'body', 'head']);
const changeablePageElements = new Set(['documentElement', 'body']);
const rootMounts = new Set(['createRoot', 'hydrateRoot', 'createPortal']);
const wrappers = new Set(['ChainExpression', 'TSNonNullExpression', 'TSAsExpression']);
const uiFile = /(?:^|\/)(?:ui\/|adapters\/|use(?:[A-Z]|-)[^/]*$)/u;
const MAX_ALIASES = 8;

function unwrapped(node) {
  const chain = [node];
  for (const current of chain) {
    if (wrappers.has(current.type)) chain.push(current.expression);
  }
  return chain.at(-1);
}

function propertyName(member) {
  return member.type === 'MemberExpression' && !member.computed ? member.property.name : undefined;
}

function constInitOf(sourceCode, node) {
  const variable = node.type === 'Identifier' ? variableNamed(sourceCode, node) : undefined;
  const [definition] = variable?.defs ?? [];
  const isConst =
    variable?.defs.length === 1 &&
    definition.type === 'Variable' &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === 'Identifier';
  return isConst && definition.node.init ? unwrapped(definition.node.init) : undefined;
}

function aliasChain(sourceCode, node) {
  const chain = [unwrapped(node)];
  for (const current of chain) {
    const alias = chain.length <= MAX_ALIASES ? constInitOf(sourceCode, current) : undefined;
    if (alias !== undefined) chain.push(alias);
  }
  return chain;
}

function isDocument(sourceCode, node) {
  const target = aliasChain(sourceCode, node).at(-1);
  if (constInitOf(sourceCode, target) !== undefined) {
    return false;
  }
  if (target.type === 'Identifier') {
    const definitions = variableNamed(sourceCode, target)?.defs ?? [];
    return target.name === 'document' && definitions.length === 0;
  }
  return (
    propertyName(target) === 'document' &&
    target.object.type === 'Identifier' &&
    globalObjects.has(target.object.name)
  );
}

function isDocumentCall(sourceCode, node, methods) {
  const call = unwrapped(node);
  return (
    call.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    isDocument(sourceCode, call.callee.object) &&
    methods.has(propertyName(call.callee))
  );
}

function pageElementName(sourceCode, node) {
  const target = unwrapped(node);
  return target.type === 'MemberExpression' && isDocument(sourceCode, target.object)
    ? propertyName(target)
    : undefined;
}

function isRefElement(sourceCode, node) {
  const target = unwrapped(node);
  const alias = constInitOf(sourceCode, target);
  return (
    propertyName(target) === 'current' || (alias !== undefined && propertyName(alias) === 'current')
  );
}

function isPageNode(sourceCode, node) {
  return aliasChain(sourceCode, node).some(
    (target) =>
      pageElements.has(pageElementName(sourceCode, target)) ||
      isDocumentCall(sourceCode, target, queryMethods) ||
      isDocumentCall(sourceCode, target, creationMethods),
  );
}

function isChangeable(sourceCode, node) {
  return (
    changeablePageElements.has(pageElementName(sourceCode, node)) || isRefElement(sourceCode, node)
  );
}

function isOutsideStyle(sourceCode, node) {
  const target = unwrapped(node);
  return propertyName(target) === 'style' && !isChangeable(sourceCode, target.object);
}

function isStyleAssign(sourceCode, call) {
  const callee = unwrapped(call.callee);
  const owner = callee.object;
  const [first] = call.arguments;
  return (
    propertyName(callee) === 'assign' &&
    owner.type === 'Identifier' &&
    owner.name === 'Object' &&
    first !== undefined &&
    isOutsideStyle(sourceCode, first)
  );
}

function isClassListChange(sourceCode, name, owner) {
  const list = unwrapped(owner);
  return (
    classListMethods.has(name) &&
    propertyName(list) === 'classList' &&
    !isChangeable(sourceCode, list.object)
  );
}

function isMethodChange(sourceCode, call) {
  const callee = unwrapped(call.callee);
  const name = propertyName(callee);
  if (name === undefined) {
    return false;
  }
  const owner = callee.object;
  return (
    contentMethods.has(name) ||
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

function isDomAssignment(sourceCode, left) {
  if (contentProperties.has(propertyName(left))) {
    return true;
  }
  if (propertyName(left) === 'className') {
    return !isChangeable(sourceCode, left.object);
  }
  return left.type === 'MemberExpression' && isOutsideStyle(sourceCode, left.object);
}

function isRootMount(callee) {
  return rootMounts.has(callee.type === 'Identifier' ? callee.name : propertyName(callee));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow changing the DOM directly from a component',
    },
    schema: [],
    messages: {
      directDom:
        'Do not query or change the page DOM directly: render the value from state or props, render into another node with `createPortal`, and reach an element through a ref (`ref.current.style`, focus, measuring); `document.documentElement` and `document.body` may change their class, style and attributes. For a third-party widget or a file download, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const queries = [];
    const changes = [];
    let rendersJsx = uiFile.test(context.filename.replaceAll('\\', '/'));
    let mountsRoot = false;

    return {
      JSXElement() {
        rendersJsx = true;
      },
      CallExpression(node) {
        mountsRoot ||= isRootMount(node.callee);
        if (isDocumentCall(sourceCode, node, queryMethods)) {
          queries.push(node);
        }
        if (isMethodChange(sourceCode, node)) {
          changes.push(node);
        }
      },
      AssignmentExpression(node) {
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
