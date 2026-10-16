import {
  jsdocOptionSchema,
  unknownMemberTags,
  withJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { readHeadPolicy } from '../../../head-policy.mjs';
import { librariesForFile } from '../../../libraries/file-libraries.mjs';
import { validationBehavior } from '../../../libraries/project-libraries.mjs';

const PARAMETER_WRAPPERS = new Set(['AssignmentPattern', 'RestElement', 'TSParameterProperty']);

function outermostWrapper(node) {
  const pending = [node];
  for (const current of pending) {
    if (PARAMETER_WRAPPERS.has(current.parent?.type)) {
      pending.push(current.parent);
    }
  }
  return pending.at(-1);
}

function isParameter(pattern) {
  const outer = outermostWrapper(pattern);
  return Array.isArray(outer.parent?.params) && outer.parent.params.includes(outer);
}

function isAnnotatedMember(annotation) {
  const owner = annotation.parent;
  if (owner.type === 'TSPropertySignature' || owner.type === 'TSIndexSignature') {
    return true;
  }
  return owner.typeAnnotation === annotation && isParameter(owner);
}

const CAUGHT_ERROR_NAMES = new Set(['cause', 'error']);

function memberName(owner) {
  return owner.type === 'TSPropertySignature' ? owner.key?.name : owner.name;
}

function isCaughtErrorSlot(node, annotation) {
  return (
    annotation.typeAnnotation === node && CAUGHT_ERROR_NAMES.has(memberName(annotation.parent))
  );
}

function createVisitors(context, rootLibraries) {
  const validation = validationBehavior(librariesForFile(context.filename, rootLibraries));
  const data = { name: validation.name, inferred: validation.inferred };
  const visitors = {
    TSUnknownKeyword(node) {
      const chain = [node, ...ancestorsOf(node)];
      const memberAt = chain.findIndex(
        (current) => current.type === 'TSTypeAnnotation' && isAnnotatedMember(current),
      );
      const typeParameterAt = chain.findIndex((current) => current.type === 'TSTypeParameter');
      if (
        memberAt !== -1 &&
        (typeParameterAt === -1 || memberAt < typeParameterAt) &&
        !isCaughtErrorSlot(node, chain[memberAt])
      ) {
        context.report({ node, messageId: 'unknownType', data });
      }
    },
  };
  return withJsdoc(context, visitors, {
    selectTags: unknownMemberTags,
    messageId: 'unknownType',
    data,
  });
}

export function unknownInDomainRule(rootLibraries) {
  return {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow the unknown type in parameter and property types of domain code',
      },
      schema: jsdocOptionSchema,
      messages: {
        unknownType:
          'domain/ code takes typed values, not unknown. Parse the input with a {{name}} schema in adapters/ and give this parameter or property the parsed type{{inferred}}. A caught error may be typed unknown as `cause` or `error`. If the value is genuinely opaque, add an exception for this rule in nitpicker.config.json.',
      },
    },
    create: (context) => createVisitors(context, rootLibraries),
  };
}

export const rule = unknownInDomainRule(readHeadPolicy().libraries);
