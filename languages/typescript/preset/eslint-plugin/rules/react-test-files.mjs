const REACT_PACKAGE = 'react';
const reactTestModule = /^(?:@testing-library\/.+|react(?:-[^/]+)?(?:\/.*)?|enzyme(?:\/.*)?)$/;
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

const moduleLoaders = new Set(['require', 'importActual', 'requireActual']);
const transparentWrappers = new Set([
  'AwaitExpression',
  'ChainExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function unwrap(node) {
  let current = node;
  while (current !== undefined && current !== null && transparentWrappers.has(current.type)) {
    current = current.argument ?? current.expression;
  }
  return current;
}

function loaderName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function loadsReact(node) {
  if (node?.type === 'ImportExpression') {
    return node.source.type === 'Literal' && node.source.value === REACT_PACKAGE;
  }
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const [argument] = node.arguments;
  return (
    moduleLoaders.has(loaderName(node.callee)) &&
    argument?.type === 'Literal' &&
    argument.value === REACT_PACKAGE
  );
}

export function isReactExpression(node, names) {
  const inner = unwrap(node);
  if (inner?.type === 'Identifier') {
    return names.has(inner.name);
  }
  if (inner?.type === 'MemberExpression' && !inner.computed && inner.property.name === 'default') {
    return isReactExpression(inner.object, names);
  }
  return loadsReact(inner);
}

function importedNames(statement) {
  if (statement.type === 'TSImportEqualsDeclaration') {
    return statement.moduleReference.expression?.value === REACT_PACKAGE ? [statement.id.name] : [];
  }
  if (statement.type !== 'ImportDeclaration' || statement.source.value !== REACT_PACKAGE) {
    return [];
  }
  return statement.specifiers
    .filter(
      (specifier) => specifier.type !== 'ImportSpecifier' || specifier.imported.name === 'default',
    )
    .map((specifier) => specifier.local.name);
}

function children(node, visitorKeys) {
  return (visitorKeys[node.type] ?? [])
    .flatMap((key) => [node[key]].flat())
    .filter((child) => typeof child?.type === 'string');
}

function declarations(root, visitorKeys) {
  const found = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    found.push(node);
    pending.push(...children(node, visitorKeys));
  }
  return found;
}

export function reactBindingNames(sourceCode, seed) {
  const nodes = declarations(sourceCode.ast, sourceCode.visitorKeys);
  const names = new Set([...seed, ...nodes.flatMap(importedNames)]);
  const declarators = nodes.filter(
    (node) => node.type === 'VariableDeclarator' && node.id.type === 'Identifier',
  );
  let grew = true;
  while (grew) {
    const before = names.size;
    for (const declarator of declarators) {
      if (isReactExpression(declarator.init, names)) {
        names.add(declarator.id.name);
      }
    }
    grew = names.size > before;
  }
  return names;
}
