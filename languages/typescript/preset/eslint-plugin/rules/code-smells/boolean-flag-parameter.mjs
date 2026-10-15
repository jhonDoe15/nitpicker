const EXPORT_PARENTS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const FUNCTION_NODES = new Set(['FunctionDeclaration', 'TSDeclareFunction']);

function isBooleanType(parameter) {
  const type = parameter.typeAnnotation?.typeAnnotation;
  if (type === undefined) return false;
  if (type.type === 'TSBooleanKeyword') return true;
  return (
    type.type === 'TSUnionType' && type.types.some(({ type: kind }) => kind === 'TSBooleanKeyword')
  );
}

function isBooleanLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'boolean';
}

function flagName(parameter) {
  if (parameter.type === 'AssignmentPattern') {
    const flagged = isBooleanLiteral(parameter.right) || isBooleanType(parameter.left);
    return flagged && parameter.left.type === 'Identifier' ? parameter.left.name : undefined;
  }
  return parameter.type === 'Identifier' && isBooleanType(parameter) ? parameter.name : undefined;
}

function exportedNames(program) {
  return new Set(
    program.body
      .filter(
        (statement) => statement.type === 'ExportNamedDeclaration' && statement.source === null,
      )
      .flatMap((statement) => statement.specifiers.map(({ local }) => local.name)),
  );
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Do not give an exported function a boolean flag parameter' },
    schema: [],
    messages: {
      flag: "'{{name}}' is a boolean flag parameter of the exported function '{{function}}'. Split it into two functions named for each behavior, or take an options object (`{ {{name}} }`) or a string union. If a boolean is the clearest form here, add an exception for nitpicker/no-boolean-flag-parameter in nitpicker.config.json.",
    },
  },
  create(context) {
    let exported = new Set();
    function check(node) {
      const isExported = EXPORT_PARENTS.has(node.parent.type) || exported.has(node.id?.name);
      if (!isExported) return;
      for (const parameter of node.params) {
        const name = flagName(parameter);
        if (name !== undefined) {
          context.report({
            node: parameter,
            messageId: 'flag',
            data: { name, function: node.id?.name ?? 'default' },
          });
        }
      }
    }
    return {
      Program(program) {
        exported = exportedNames(program);
      },
      ...Object.fromEntries([...FUNCTION_NODES].map((type) => [type, check])),
    };
  },
};
