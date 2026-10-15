const queryMethods = new Set([
  'getElementById',
  'getElementsByClassName',
  'getElementsByName',
  'getElementsByTagName',
  'querySelector',
  'querySelectorAll',
]);
const contentProperties = new Set([
  'className',
  'innerHTML',
  'innerText',
  'outerHTML',
  'textContent',
]);
const classListMethods = new Set(['add', 'remove', 'toggle', 'replace']);
const rootMounts = new Set(['createRoot', 'hydrateRoot']);

function propertyName(member) {
  return member.type === 'MemberExpression' && !member.computed ? member.property.name : undefined;
}

function isDocumentQuery(callee) {
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'document' &&
    queryMethods.has(propertyName(callee))
  );
}

function isRootMount(callee) {
  return rootMounts.has(callee.type === 'Identifier' ? callee.name : propertyName(callee));
}

function isClassListMutation(callee) {
  return (
    callee.type === 'MemberExpression' &&
    classListMethods.has(propertyName(callee)) &&
    propertyName(callee.object) === 'classList'
  );
}

function isDomAssignment(left) {
  return (
    contentProperties.has(propertyName(left)) ||
    (left.type === 'MemberExpression' && propertyName(left.object) === 'style')
  );
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
        'Do not change the DOM directly: render the value from state or props, and use a ref only to focus or measure. For a third-party widget, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const queries = [];
    const changes = [];
    let rendersJsx = false;
    let mountsRoot = false;

    return {
      JSXElement() {
        rendersJsx = true;
      },
      CallExpression(node) {
        mountsRoot ||= isRootMount(node.callee);
        if (isDocumentQuery(node.callee)) {
          queries.push(node);
        }
        if (isClassListMutation(node.callee)) {
          changes.push(node);
        }
      },
      AssignmentExpression(node) {
        if (isDomAssignment(node.left)) {
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
