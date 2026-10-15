import { ancestorsOf, variableNamed } from './ancestry.mjs';
import {
  jsdocOptionSchema,
  typePredicateTags,
  withJsdoc,
} from '../../../../javascript/preset/jsdoc.mjs';

const UNTYPED_KEYWORDS = new Set(['TSUnknownKeyword', 'TSAnyKeyword', 'TSObjectKeyword']);
const SCHEMA_PARSE_METHODS = new Set(['parse', 'safeParse', 'parseAsync', 'safeParseAsync']);

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

function isSchemaParseCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    SCHEMA_PARSE_METHODS.has(node.callee.property.name)
  );
}

function isSchemaParseArgument(expression) {
  const parent = expression.parent;
  return isSchemaParseCall(parent) && parent.arguments.includes(expression);
}

function isUntypedInput(type) {
  if (type === undefined) {
    return false;
  }
  if (UNTYPED_KEYWORDS.has(type.type)) {
    return true;
  }
  if (type.type === 'TSTypeLiteral') {
    return type.members.length === 0;
  }
  const [, value] = type.typeArguments?.params ?? type.typeParameters?.params ?? [];
  return (
    type.type === 'TSTypeReference' && type.typeName.name === 'Record' && isUntypedInput(value)
  );
}

function predicateInputType(predicate) {
  const owner = ancestorsOf(predicate).find((ancestor) => Array.isArray(ancestor.params));
  const parameter = owner?.params.find(
    (candidate) => candidate.name === predicate.parameterName?.name,
  );
  return parameter?.typeAnnotation?.typeAnnotation;
}

function declaredType(variable) {
  const definition = variable?.defs.at(0);
  if (definition?.type === 'Parameter') {
    return definition.name.typeAnnotation?.typeAnnotation;
  }
  return definition?.type === 'Variable'
    ? definition.node.id.typeAnnotation?.typeAnnotation
    : undefined;
}

function isTypeofObject(node) {
  const [typeofSide, literal] =
    node.left.type === 'UnaryExpression' ? [node.left, node.right] : [node.right, node.left];
  return (
    typeofSide.type === 'UnaryExpression' &&
    typeofSide.operator === 'typeof' &&
    literal.type === 'Literal' &&
    literal.value === 'object'
  );
}

function narrowedIdentifier(node) {
  if (node.operator === 'in') {
    return node.left.type === 'Literal' && typeof node.left.value === 'string'
      ? node.right
      : undefined;
  }
  if (!['===', '!==', '==', '!='].includes(node.operator) || !isTypeofObject(node)) {
    return undefined;
  }
  return [node.left, node.right].find((side) => side.type === 'UnaryExpression').argument;
}

function isInsidePredicate(node) {
  const owner = ancestorsOf(node).find((ancestor) => Array.isArray(ancestor.params));
  return owner?.returnType?.typeAnnotation.type === 'TSTypePredicate';
}

function isOverloadCast(node) {
  const returnType = node.returnType?.typeAnnotation.type;
  const siblings =
    node.parent.type === 'ExportNamedDeclaration' ? node.parent.parent.body : node.parent.body;
  return (
    node.body !== null &&
    (returnType === 'TSUnknownKeyword' || returnType === 'TSAnyKeyword') &&
    siblings.some((statement) => {
      const declaration = statement.declaration ?? statement;
      return declaration.type === 'TSDeclareFunction' && declaration.id?.name === node.id?.name;
    })
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require external data in adapters to be parsed with a zod schema instead of a hand-written type guard',
    },
    schema: jsdocOptionSchema,
    messages: {
      typePredicate:
        'Do not hand-write a type guard for unknown input: parse it once at the boundary with a zod schema (schema.parse or schema.safeParse). A predicate over a union (`(result): result is Ok => result.kind === "ok"`) is fine. If the guard is genuinely needed, add an exception for this rule in nitpicker.config.json.',
      inlineNarrowing:
        'Do not hand-narrow an `unknown` value with `typeof x === "object"` or `"key" in x`: parse it once at the boundary with a zod schema (schema.safeParse). A caught error is read with `error instanceof Error`. If the narrowing is genuinely needed, add an exception for this rule in nitpicker.config.json.',
      overloadCast:
        'This overload implementation returns unknown or any, which makes its overload signatures a cast. Return a typed value, or split it into separate functions.',
      unparsedJson:
        'Pass `JSON.parse(text)` straight into `schema.safeParse(...)` inside the same `try`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function isParsedBySchema(call) {
      if (isSchemaParseArgument(call)) {
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
              reference.identifier !== declarator.id && isSchemaParseArgument(reference.identifier),
          ),
        );
    }

    const visitors = {
      TSTypePredicate(node) {
        if (isUntypedInput(predicateInputType(node))) {
          context.report({ node, messageId: 'typePredicate' });
        }
      },
      BinaryExpression(node) {
        const identifier = narrowedIdentifier(node);
        if (
          identifier?.type === 'Identifier' &&
          !isInsidePredicate(node) &&
          declaredType(variableNamed(sourceCode, identifier))?.type === 'TSUnknownKeyword'
        ) {
          context.report({ node, messageId: 'inlineNarrowing' });
        }
      },
      FunctionDeclaration(node) {
        if (isOverloadCast(node)) {
          context.report({ node, messageId: 'overloadCast' });
        }
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
  },
};
