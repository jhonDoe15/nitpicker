import { isBooleanLiteral } from '../support/literals.mjs';

const NAMED_EXPORT = 'ExportNamedDeclaration';
const IDENTIFIER = 'Identifier';
const EXPORT_PARENTS = new Set([NAMED_EXPORT, 'ExportDefaultDeclaration']);
const FUNCTION_VALUES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const CONDITIONS = new Set(['IfStatement', 'ConditionalExpression']);
const PASS_THROUGH = new Set(['LogicalExpression', 'UnaryExpression']);
const SETTER_OR_FACTORY = /^(?:(?:use|set|with)[A-Z]|of$|from$)/;

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

function flagName(parameter) {
  if (parameter.type === 'AssignmentPattern') {
    const flagged = isBooleanLiteral(parameter.right) || isBooleanType(parameter.left);
    return flagged && parameter.left.type === IDENTIFIER ? parameter.left.name : undefined;
  }
  return parameter.type === IDENTIFIER && isBooleanType(parameter) ? parameter.name : undefined;
}

function exportedNames(program) {
  return new Set(
    program.body
      .filter((statement) => statement.type === NAMED_EXPORT && statement.source === null)
      .flatMap((statement) => statement.specifiers.map(({ local }) => local.name)),
  );
}

function selectsBehavior(identifier) {
  const chain = [identifier];
  for (const node of chain) {
    if (PASS_THROUGH.has(node.parent.type)) {
      chain.push(node.parent);
    }
  }
  const root = chain.at(-1);
  return CONDITIONS.has(root.parent.type) && root.parent.test === root;
}

function isTypePredicate(fn) {
  return fn.returnType?.typeAnnotation.type === 'TSTypePredicate';
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
        'If a boolean is the clearest form here, add an exception for nitpicker/no-boolean-flag-parameter',
        'in nitpicker.config.json.',
      ].join(' '),
    },
  },
  create(context) {
    const { sourceCode } = context;
    let exported = new Set();
    function check(fn) {
      const name = exportedFunctionName(fn, exported);
      if (name === undefined || SETTER_OR_FACTORY.test(name) || isTypePredicate(fn)) {
        return;
      }
      const flags = new Set(fn.params.map(flagName).filter((flag) => flag !== undefined));
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
