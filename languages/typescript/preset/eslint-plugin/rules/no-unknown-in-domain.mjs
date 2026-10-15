import {
  jsdocOptionSchema,
  unknownMemberTags,
  withJsdoc,
} from '../../../../javascript/preset/jsdoc.mjs';
import { ancestorsOf } from './ancestry.mjs';

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

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow the unknown type in parameter and property types of domain code',
    },
    schema: jsdocOptionSchema,
    messages: {
      unknownType:
        'domain/ code takes typed values, not unknown. Parse the input with a zod schema in adapters/ and give this parameter or property the parsed type (z.infer<typeof schema>). A caught error may be typed unknown as `cause` or `error`. An exception fits only when the value is genuinely opaque.',
    },
  },
  create(context) {
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
          context.report({ node, messageId: 'unknownType' });
        }
      },
    };
    return withJsdoc(context, visitors, {
      selectTags: unknownMemberTags,
      messageId: 'unknownType',
    });
  },
};
