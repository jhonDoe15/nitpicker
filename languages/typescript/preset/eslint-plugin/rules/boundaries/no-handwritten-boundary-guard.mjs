import {
  jsdocOptionSchema,
  typePredicateTags,
  withJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';
import { readHeadPolicy } from '../../../head-policy.mjs';
import { validationBehavior } from '../../../libraries/project-libraries.mjs';

function isJsonParse(node) {
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'JSON' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'parse'
  );
}

function isSchemaParseCall(node, validation) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const { callee } = node;
  if (callee.type === 'Identifier') {
    return validation.functions.has(callee.name);
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    validation.methods.has(callee.property.name)
  );
}

function isSchemaParseArgument(expression, validation) {
  const parent = expression.parent;
  return isSchemaParseCall(parent, validation) && parent.arguments.includes(expression);
}

export function boundaryGuardRule(validation) {
  const schemaName = validation.isZod ? 'a zod schema' : `a ${validation.name} schema`;
  return {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Require external data in adapters to be parsed with a schema instead of a hand-written type guard',
      },
      schema: jsdocOptionSchema,
      messages: {
        typePredicate: `Do not hand-write a type guard for external data: parse it once at the boundary with ${schemaName} (${validation.example}).`,
        unparsedJson: `Pass \`JSON.parse(text)\` straight into \`${validation.call}(...)\` inside the same \`try\`.`,
      },
    },
    create: (context) => createVisitors(context, validation),
  };
}

function createVisitors(context, validation) {
  const sourceCode = context.sourceCode;

  function isParsedBySchema(call) {
    if (isSchemaParseArgument(call, validation)) {
      return true;
    }
    const declarator = call.parent;
    if (
      declarator.type !== 'VariableDeclarator' ||
      declarator.init !== call ||
      declarator.id.type !== 'Identifier'
    ) {
      return false;
    }
    return sourceCode
      .getDeclaredVariables(declarator)
      .some((variable) =>
        variable.references.some(
          (reference) =>
            reference.identifier !== declarator.id &&
            isSchemaParseArgument(reference.identifier, validation),
        ),
      );
  }

  const visitors = {
    TSTypePredicate(node) {
      context.report({ node, messageId: 'typePredicate' });
    },
    CallExpression(node) {
      if (isJsonParse(node) && !isParsedBySchema(node)) {
        context.report({ node, messageId: 'unparsedJson' });
      }
    },
  };
  return withJsdoc(context, visitors, {
    selectTags: typePredicateTags,
    messageId: 'typePredicate',
  });
}

export const rule = boundaryGuardRule(validationBehavior(readHeadPolicy().libraries));
