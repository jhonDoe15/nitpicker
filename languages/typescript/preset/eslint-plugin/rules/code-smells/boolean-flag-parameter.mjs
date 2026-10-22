import { isBooleanLiteral } from '../support/literals.mjs';

const NAMED_EXPORT = 'ExportNamedDeclaration';
const IDENTIFIER = 'Identifier';
const EXPORT_PARENTS = new Set([NAMED_EXPORT, 'ExportDefaultDeclaration']);
const FUNCTION_VALUES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const CONDITIONS = new Set([
  'IfStatement',
  'ConditionalExpression',
  'WhileStatement',
  'DoWhileStatement',
]);
const PASS_THROUGH = new Set(['LogicalExpression', 'UnaryExpression']);
const EQUALITY = new Set(['==', '===', '!=', '!==']);
const HOOK_OR_FACTORY = /^(?:use[A-Z]|of$|from$|valueOf$|builder$)/;
const METHOD_SETTER = /^(?:set|with)[A-Z]/;
const JSDOC_PARAM = /@param\s+\{([^}]*)\}\s+\[?([\w$]+)/g;

function isBooleanType(parameter) {
  const type = parameter.typeAnnotation?.typeAnnotation;
  if (type === undefined) {
    return false;
  }
  if (type.type === 'TSBooleanKeyword') {
    return true;
  }
  return (
    type.type === 'TSUnionType' && type.types.some(({ type: kind }) => kind === 'TSBooleanKeyword')
  );
}

function isDocumentedBoolean(type) {
  return type.split('|').some((part) => part.replaceAll(/[?!=\s()]/g, '') === 'boolean');
}

function documentedNode(fn) {
  const { parent } = fn;
  const node =
    parent.type === 'VariableDeclarator'
      ? parent.parent
      : parent.type === 'MethodDefinition'
        ? parent
        : fn;
  return EXPORT_PARENTS.has(node.parent?.type) ? node.parent : node;
}

function documentedFlags(fn, sourceCode) {
  const comment = sourceCode
    .getCommentsBefore(documentedNode(fn))
    .findLast(({ type, value }) => type === 'Block' && value.startsWith('*'));
  return new Set(
    [...(comment?.value ?? '').matchAll(JSDOC_PARAM)]
      .filter(([, type]) => isDocumentedBoolean(type))
      .map(([, , name]) => name),
  );
}

function flagName(parameter, documented) {
  if (parameter.type === 'AssignmentPattern') {
    const flagged = isBooleanLiteral(parameter.right) || isBooleanType(parameter.left);
    return flagged && parameter.left.type === IDENTIFIER ? parameter.left.name : undefined;
  }
  if (parameter.type !== IDENTIFIER) {
    return undefined;
  }
  const typed =
    parameter.typeAnnotation === undefined
      ? documented.has(parameter.name)
      : isBooleanType(parameter);
  return typed ? parameter.name : undefined;
}

function exportedNames(program) {
  return new Set(
    program.body
      .filter((statement) => statement.type === NAMED_EXPORT && statement.source === null)
      .flatMap((statement) => statement.specifiers.map(({ local }) => local.name)),
  );
}

function isBooleanComparison(node, operand) {
  if (node.type !== 'BinaryExpression' || !EQUALITY.has(node.operator)) {
    return false;
  }
  return isBooleanLiteral(node.left === operand ? node.right : node.left);
}

function selectsBehavior(identifier) {
  const chain = [identifier];
  for (const node of chain) {
    if (PASS_THROUGH.has(node.parent.type) || isBooleanComparison(node.parent, node)) {
      chain.push(node.parent);
    }
  }
  const root = chain.at(-1);
  return CONDITIONS.has(root.parent.type) && root.parent.test === root;
}

function isTypePredicate(fn) {
  return fn.returnType?.typeAnnotation.type === 'TSTypePredicate';
}

function isSkippedName(fn, name) {
  return (
    HOOK_OR_FACTORY.test(name) ||
    (fn.parent.type === 'MethodDefinition' && METHOD_SETTER.test(name))
  );
}

function exportedFunctionName(fn, exported) {
  const { parent } = fn;
  if (fn.type === 'FunctionDeclaration') {
    const named = EXPORT_PARENTS.has(parent.type) || exported.has(fn.id?.name);
    return named ? (fn.id?.name ?? 'default') : undefined;
  }
  if (parent.type === 'VariableDeclarator' && parent.id.type === IDENTIFIER) {
    const declaration = parent.parent.parent;
    const named = declaration.type === NAMED_EXPORT || exported.has(parent.id.name);
    return named ? parent.id.name : undefined;
  }
  return parent.type === 'MethodDefinition' ? exportedMethodName(parent, exported) : undefined;
}

function exportedMethodName(method, exported) {
  const owner = method.parent.parent;
  const ownerExported = EXPORT_PARENTS.has(owner.parent.type) || exported.has(owner.id?.name);
  const isPublic = method.kind === 'method' && method.accessibility !== 'private';
  const named = method.key.type === IDENTIFIER && !method.computed;
  return ownerExported && isPublic && named ? method.key.name : undefined;
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Do not let a boolean parameter switch an exported function between two behaviors',
    },
    schema: [],
    messages: {
      flag: [
        "'{{name}}' switches the exported function '{{function}}' between two behaviors.",
        'Split it into two functions named for each behavior, or take an options object (`{ {{name}} }`)',
        'or a string union.',
        'An exception fits only when a boolean is the clearest form here.',
      ].join(' '),
    },
  },
  create(context) {
    const { sourceCode } = context;
    let exported = new Set();
    function check(fn) {
      const name = exportedFunctionName(fn, exported);
      if (name === undefined || isSkippedName(fn, name) || isTypePredicate(fn)) {
        return;
      }
      const documented = documentedFlags(fn, sourceCode);
      const flags = new Set(
        fn.params.map((parameter) => flagName(parameter, documented)).filter(Boolean),
      );
      for (const variable of sourceCode.getDeclaredVariables(fn)) {
        const switches = variable.references.some(({ identifier }) => selectsBehavior(identifier));
        if (flags.has(variable.name) && switches) {
          const [definition] = variable.defs;
          context.report({
            node: definition.name,
            messageId: 'flag',
            data: { name: variable.name, function: name },
          });
        }
      }
    }
    return {
      Program(program) {
        exported = exportedNames(program);
      },
      FunctionDeclaration: check,
      ...Object.fromEntries([...FUNCTION_VALUES].map((type) => [type, check])),
    };
  },
};
