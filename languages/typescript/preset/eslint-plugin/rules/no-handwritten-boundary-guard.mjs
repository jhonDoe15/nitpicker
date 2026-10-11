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

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require external data in adapters to be parsed with a zod schema instead of a hand-written type guard',
    },
    schema: [],
    messages: {
      typePredicate:
        'Do not hand-write a type guard for external data: parse it once at the boundary with a zod schema (schema.parse or schema.safeParse).',
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

    return {
      TSTypePredicate(node) {
        context.report({ node, messageId: 'typePredicate' });
      },
      CallExpression(node) {
        if (isJsonParse(node) && !isParsedBySchema(node)) {
          context.report({ node, messageId: 'unparsedJson' });
        }
      },
    };
  },
};
