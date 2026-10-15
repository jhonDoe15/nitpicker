import {
  jsdocOptionSchema,
  unknownMemberTags,
  withJsdoc,
} from '../../../../javascript/preset/jsdoc.mjs';
import { ancestorsOf, variableNamed } from './ancestry.mjs';

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

function aliasedType(sourceCode, reference) {
  if (reference.typeName.type !== 'Identifier') {
    return undefined;
  }
  const definition = variableNamed(sourceCode, reference.typeName)?.defs.find(
    ({ type }) => type === 'Type',
  );
  return definition?.node.type === 'TSTypeAliasDeclaration' && !definition.node.typeParameters
    ? definition.node.typeAnnotation
    : undefined;
}

function resolvesToUnknown(sourceCode, node) {
  const chain = [node];
  for (const current of chain) {
    const target =
      current.type === 'TSTypeReference' ? aliasedType(sourceCode, current) : undefined;
    if (target !== undefined && !chain.includes(target)) {
      chain.push(target);
    }
  }
  return chain.at(-1).type === 'TSUnknownKeyword';
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
        'domain/ code takes typed values, not unknown (also through a type alias). Write a readonly type for this value in domain/; adapters/ parses the input with a zod schema and passes the result in (a zod output is assignable to a readonly type; do not import the schema type from adapters/). A caught error may be typed unknown as `cause` or `error`. If the value is genuinely opaque, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    function check(node) {
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
    }
    const visitors = {
      TSUnknownKeyword: check,
      TSTypeReference(node) {
        if (node.typeName.type === 'Identifier' && resolvesToUnknown(context.sourceCode, node)) {
          check(node);
        }
      },
    };
    return withJsdoc(context, visitors, {
      selectTags: unknownMemberTags,
      messageId: 'unknownType',
    });
  },
};
