import {
  jsdocOptionSchema,
  triStateBooleanTags,
  withJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';

const ABSENT = new Set(['TSUndefinedKeyword', 'TSNullKeyword']);
const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
  'TSFunctionType',
  'TSMethodSignature',
  'TSCallSignature',
]);
const PARAMETER_WRAPPERS = new Set(['AssignmentPattern', 'RestElement', 'TSParameterProperty']);

function literalValue(node) {
  return node.type === 'TSLiteralType' && node.literal.type === 'Literal'
    ? node.literal.value
    : undefined;
}

function isBooleanMembers(members) {
  if (members.length === 1) {
    return members[0].type === 'TSBooleanKeyword';
  }
  const values = members.map(literalValue);
  return members.length === 2 && values.includes(true) && values.includes(false);
}

function isTriStateUnion(node) {
  if (node.type !== 'TSUnionType') {
    return false;
  }
  const absent = node.types.filter((member) => ABSENT.has(member.type));
  return (
    absent.length > 0 && isBooleanMembers(node.types.filter((member) => !ABSENT.has(member.type)))
  );
}

function resolvedType(node) {
  const isPromise =
    node.type === 'TSTypeReference' &&
    node.typeName.name === 'Promise' &&
    node.typeArguments?.params.length === 1;
  return isPromise ? node.typeArguments.params[0] : node;
}

function isTriState(annotation) {
  const type = annotation?.typeAnnotation;
  return type !== undefined && isTriStateUnion(resolvedType(type));
}

function isOverride(owner) {
  return owner?.type === 'MethodDefinition' && owner.override === true;
}

function isOptionalBoolean(parameter) {
  return (
    parameter.type === 'Identifier' &&
    parameter.optional === true &&
    parameter.typeAnnotation?.typeAnnotation.type === 'TSBooleanKeyword'
  );
}

function bareParameter(parameter) {
  let current = parameter;
  while (PARAMETER_WRAPPERS.has(current.type)) {
    current =
      current.type === 'AssignmentPattern' ? current.left : (current.parameter ?? current.argument);
  }
  return current;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow a boolean that can also be undefined or null' },
    schema: jsdocOptionSchema,
    messages: {
      triStateBoolean:
        "{{ name }} is a boolean that can also be absent, so it has three states: true, false and nothing. Take a required `boolean`, or name each state in a union of string literals (`'on' | 'off' | 'auto'`).",
    },
  },
  create(context) {
    function report(node, name) {
      context.report({ node, messageId: 'triStateBoolean', data: { name } });
    }

    function checkParameter(parameter) {
      const bare = bareParameter(parameter);
      if (
        bare.type === 'Identifier' &&
        (isTriState(bare.typeAnnotation) || isOptionalBoolean(bare))
      ) {
        report(bare, `\`${bare.name}\``);
      }
    }

    function checkFunction(node) {
      if (isOverride(node.parent)) {
        return;
      }
      node.params.forEach(checkParameter);
      if (isTriState(node.returnType)) {
        report(node.returnType, 'The return value');
      }
    }

    function checkMember(node) {
      if (isTriState(node.typeAnnotation) && !isOverride(node)) {
        report(node, `\`${node.key?.name ?? 'this member'}\``);
      }
    }

    const visitors = {
      ...Object.fromEntries([...FUNCTIONS].map((type) => [type, checkFunction])),
      TSPropertySignature: checkMember,
      PropertyDefinition: checkMember,
    };
    return withJsdoc(context, visitors, {
      selectTags: triStateBooleanTags,
      messageId: 'triStateBoolean',
      data: { name: 'This JSDoc type' },
    });
  },
};
