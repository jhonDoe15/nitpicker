const queryMethods = new Set([
  'getElementById',
  'getElementsByClassName',
  'getElementsByName',
  'getElementsByTagName',
  'querySelector',
  'querySelectorAll',
]);
const contentProperties = new Set(['innerHTML', 'innerText', 'outerHTML', 'textContent']);
const globalObjects = new Set(['window', 'globalThis', 'self']);
const pageElements = new Set(['documentElement', 'body']);
const uiFile = /(?:^|\/)(?:ui\/|use(?:[A-Z]|-)[^/]*$)/u;
const classListMethods = new Set(['add', 'remove', 'toggle', 'replace']);
const rootMounts = new Set(['createRoot', 'hydrateRoot']);

function propertyName(member) {
  return member.type === 'MemberExpression' && !member.computed ? member.property.name : undefined;
}

function isDocument(node) {
  if (node.type === 'Identifier') {
    return node.name === 'document';
  }
  return (
    propertyName(node) === 'document' &&
    node.object.type === 'Identifier' &&
    globalObjects.has(node.object.name)
  );
}

function isDocumentQuery(callee) {
  return (
    callee.type === 'MemberExpression' &&
    isDocument(callee.object) &&
    queryMethods.has(propertyName(callee))
  );
}

function isPageElement(element) {
  return pageElements.has(propertyName(element)) && isDocument(element.object);
}

function isRefElement(element, refNames) {
  const target = element.type === 'ChainExpression' ? element.expression : element;
  return (
    propertyName(target) === 'current' ||
    (target.type === 'Identifier' && refNames.has(target.name))
  );
}

function isAllowedTarget(element, refNames) {
  return isPageElement(element) || isRefElement(element, refNames);
}

function isRootMount(callee) {
  return rootMounts.has(callee.type === 'Identifier' ? callee.name : propertyName(callee));
}

function isClassListMutation(callee, refNames) {
  return (
    callee.type === 'MemberExpression' &&
    classListMethods.has(propertyName(callee)) &&
    propertyName(callee.object) === 'classList' &&
    !isAllowedTarget(callee.object.object, refNames)
  );
}

function isDomAssignment(left, refNames) {
  if (contentProperties.has(propertyName(left))) {
    return true;
  }
  if (propertyName(left) === 'className') {
    return !isAllowedTarget(left.object, refNames);
  }
  return (
    left.type === 'MemberExpression' &&
    propertyName(left.object) === 'style' &&
    !isAllowedTarget(left.object.object, refNames)
  );
}

function refAlias(node) {
  const init = node.init?.type === 'ChainExpression' ? node.init.expression : node.init;
  return node.id.type === 'Identifier' && init && propertyName(init) === 'current'
    ? node.id.name
    : undefined;
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
        'Do not query or change the page DOM directly: render the value from state or props, and reach an element through a ref (`ref.current.style`, focus, measuring); `document.documentElement` and `document.body` may be changed. For a third-party widget, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const queries = [];
    const changes = [];
    const refNames = new Set();
    let rendersJsx = uiFile.test(context.filename.replaceAll('\\', '/'));
    let mountsRoot = false;

    return {
      JSXElement() {
        rendersJsx = true;
      },
      VariableDeclarator(node) {
        const alias = refAlias(node);
        if (alias !== undefined) {
          refNames.add(alias);
        }
      },
      CallExpression(node) {
        mountsRoot ||= isRootMount(node.callee);
        if (isDocumentQuery(node.callee)) {
          queries.push(node);
        }
        if (isClassListMutation(node.callee, refNames)) {
          changes.push(node);
        }
      },
      AssignmentExpression(node) {
        if (isDomAssignment(node.left, refNames)) {
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
