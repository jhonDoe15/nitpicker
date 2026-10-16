import {
  jsdocOptionSchema,
  typePredicateTags,
  withJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';
import { readHeadPolicy } from '../../../head-policy.mjs';
import { librariesForFile } from '../../../libraries/file-libraries.mjs';
import { validationBehavior } from '../../../libraries/project-libraries.mjs';
import { isParsedBySchema } from '../../../libraries/schema-calls.mjs';

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

function createVisitors(context, rootLibraries) {
  const validation = validationBehavior(librariesForFile(context.filename, rootLibraries));
  const data = { name: validation.name, example: validation.example };
  const visitors = {
    TSTypePredicate(node) {
      context.report({ node, messageId: 'typePredicate', data });
    },
    CallExpression(node) {
      if (isJsonParse(node) && !isParsedBySchema(context.sourceCode, node, validation.accepted)) {
        context.report({ node, messageId: 'unparsedJson', data: { call: validation.call } });
      }
    },
  };
  return withJsdoc(context, visitors, {
    selectTags: typePredicateTags,
    messageId: 'typePredicate',
    data,
  });
}

export function boundaryGuardRule(rootLibraries) {
  return {
    meta: {
      type: 'problem',
      docs: {
        description:
          'Require external data in adapters to be parsed with a schema instead of a hand-written type guard',
      },
      schema: jsdocOptionSchema,
      messages: {
        typePredicate:
          'Do not hand-write a type guard for external data: parse it once at the boundary with a {{name}} schema ({{example}}).',
        unparsedJson:
          'Pass `JSON.parse(text)` straight into `{{call}}(...)` inside the same `try`.',
      },
    },
    create: (context) => createVisitors(context, rootLibraries),
  };
}

export const rule = boundaryGuardRule(readHeadPolicy().libraries);
