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
    const found = [];
    let rendersJsx = false;

    return {
      JSXElement() {
        rendersJsx = true;
      },
      CallExpression(node) {
        if (isDocumentQuery(node.callee) || isClassListMutation(node.callee)) {
          found.push(node);
        }
      },
      AssignmentExpression(node) {
        if (isDomAssignment(node.left)) {
          found.push(node);
        }
      },
      'Program:exit'() {
        if (rendersJsx) {
          for (const node of found) {
            context.report({ node, messageId: 'directDom' });
          }
        }
      },
    };
  },
};
