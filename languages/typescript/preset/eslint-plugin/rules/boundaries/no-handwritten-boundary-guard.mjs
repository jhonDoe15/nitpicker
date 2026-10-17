import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';
import { isNarrowedByInstanceof } from '../analysis/narrowing/instanceof-guards.mjs';
import {
  jsdocOptionSchema,
  typePredicateTags,
  withJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';
import { readHeadPolicy } from '../../../head-policy.mjs';
import { librariesForFile } from '../../../libraries/file-libraries.mjs';
import { validationBehavior } from '../../../libraries/project-libraries.mjs';
import { isParsedBySchema, schemaContext } from '../../../libraries/schema-calls.mjs';

const UNTYPED_KEYWORDS = new Set(['TSUnknownKeyword', 'TSAnyKeyword', 'TSObjectKeyword']);

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

function isJsonCopy(node) {
  const [argument] = node.arguments;
  return (
    argument?.type === 'CallExpression' &&
    argument.callee.type === 'MemberExpression' &&
    argument.callee.object.name === 'JSON' &&
    argument.callee.property.name === 'stringify'
  );
}

function recordValueType(type) {
  if (type.type !== 'TSTypeReference' || type.typeName.name !== 'Record') {
    return undefined;
  }
  const [, value] = type.typeArguments?.params ?? type.typeParameters?.params ?? [];
  return value;
}

function isUntypedLeaf(type) {
  if (type === undefined) {
    return false;
  }
  return type.type === 'TSTypeLiteral'
    ? type.members.length === 0
    : UNTYPED_KEYWORDS.has(type.type);
}

function isUntypedInput(type) {
  const chain = [type];
  for (const current of chain) {
    const value = current === undefined ? undefined : recordValueType(current);
    if (value !== undefined) {
      chain.push(value);
    }
  }
  return isUntypedLeaf(chain.at(-1));
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

function isHandNarrowing(sourceCode, node) {
  const identifier = narrowedIdentifier(node);
  return (
    identifier?.type === 'Identifier' &&
    !isInsidePredicate(node) &&
    !isNarrowedByInstanceof(sourceCode, node, identifier.name) &&
    declaredType(variableNamed(sourceCode, identifier))?.type === 'TSUnknownKeyword'
  );
}

function createVisitors(context, rootLibraries) {
  const { sourceCode } = context;
  const validation = validationBehavior(librariesForFile(context, rootLibraries));
  const schema = schemaContext(context);
  const data = { phrase: validation.phrase, example: validation.example };
  const visitors = {
    TSTypePredicate(node) {
      if (isUntypedInput(predicateInputType(node))) {
        context.report({ node, messageId: 'typePredicate', data });
      }
    },
    BinaryExpression(node) {
      if (isHandNarrowing(sourceCode, node)) {
        context.report({ node, messageId: 'inlineNarrowing', data });
      }
    },
    FunctionDeclaration(node) {
      if (isOverloadCast(node)) {
        context.report({ node, messageId: 'overloadCast' });
      }
    },
    CallExpression(node) {
      if (isJsonParse(node) && !isParsedBySchema(schema, node, validation.accepted)) {
        const messageId = isJsonCopy(node) ? 'jsonCopy' : 'unparsedJson';
        context.report({ node, messageId, data: { ...data, call: validation.call } });
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
          'Do not hand-write a type guard for unknown input: parse it once at the boundary with {{phrase}} ({{example}}). A predicate over a union (`(result): result is Ok => result.kind === "ok"`) is fine. An exception fits only when the guard is genuinely needed.',
        inlineNarrowing:
          'Do not hand-narrow an `unknown` value with `typeof x === "object"` or `"key" in x`: parse it once at the boundary with {{phrase}} ({{example}}). A caught error is read with `error instanceof Error`. An exception fits only when the narrowing is genuinely needed.',
        overloadCast:
          'This overload implementation returns unknown or any, which makes its overload signatures a cast. Return a typed value, or split it into separate functions. An exception fits only when it is deliberate.',
        unparsedJson:
          'Pass `JSON.parse(text)` straight into `{{call}}(...)` inside the same `try`. An exception fits only when the text is trusted and already typed.',
        jsonCopy:
          'Copy a value with `structuredClone(value)`, not `JSON.parse(JSON.stringify(value))`. An exception fits only when it is deliberate.',
      },
    },
    create: (context) => createVisitors(context, rootLibraries),
  };
}

export const rule = boundaryGuardRule(readHeadPolicy().libraries);
