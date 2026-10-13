const reactTestModule = /^(?:@testing-library\/.+|react(?:-[^/]+)?(?:\/.*)?|enzyme(?:\/.*)?)$/;
const REACT_PACKAGE = 'react';
const projectTestUtilsModule = /^\.{1,2}\/(?:.*\/)?[^/]*test-utils[^/]*$/;

function isReactTestModule(source) {
  return (
    typeof source === 'string' &&
    (reactTestModule.test(source) || projectTestUtilsModule.test(source))
  );
}

function requiredSource(node) {
  const isRequire =
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  const [argument] = isRequire ? node.arguments : [];
  return argument?.type === 'Literal' ? argument.value : undefined;
}

function statementSources(statement) {
  switch (statement.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
      return [statement.source?.value];
    case 'TSImportEqualsDeclaration':
      return [statement.moduleReference.expression?.value];
    case 'ExpressionStatement':
      return [requiredSource(statement.expression)];
    case 'VariableDeclaration':
      return statement.declarations.map((declarator) => requiredSource(declarator.init));
    default:
      return [];
  }
}

function importsReactTestModule(program) {
  return program.body.some((statement) => statementSources(statement).some(isReactTestModule));
}

export function inReactTestFilesOnly(create) {
  return (context) => (importsReactTestModule(context.sourceCode.ast) ? create(context) : {});
}

function boundToReact(statement) {
  switch (statement.type) {
    case 'ImportDeclaration':
      return statement.source.value === REACT_PACKAGE
        ? statement.specifiers
            .filter((specifier) => specifier.type !== 'ImportSpecifier')
            .map((specifier) => specifier.local.name)
        : [];
    case 'TSImportEqualsDeclaration':
      return statement.moduleReference.expression?.value === REACT_PACKAGE
        ? [statement.id.name]
        : [];
    case 'VariableDeclaration':
      return statement.declarations
        .filter(
          (declarator) =>
            declarator.id.type === 'Identifier' &&
            requiredSource(declarator.init) === REACT_PACKAGE,
        )
        .map((declarator) => declarator.id.name);
    default:
      return [];
  }
}

export function reactBindingNames(program) {
  return new Set(program.body.flatMap(boundToReact));
}

export function isRequireOfReact(node) {
  return requiredSource(node) === REACT_PACKAGE;
}
