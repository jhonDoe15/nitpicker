import path from 'node:path';
import { layoutFeatures } from '../../../architecture/strict-layout.mjs';
import { exportLeaks } from './contract-members.mjs';

const FEATURE_INDEX = new RegExp(`${layoutFeatures.feature}/index\\.[cm]?[jt]sx?$`, 'u');

const DECLARATION_TYPES = new Set([
  'FunctionDeclaration',
  'ClassDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
]);

function nameOf(node) {
  return node.type === 'Identifier' ? node.name : String(node.value);
}

function declaredNames(declaration) {
  if (DECLARATION_TYPES.has(declaration.type)) {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  return declaration.type === 'VariableDeclaration'
    ? declaration.declarations.filter(({ id }) => id.type === 'Identifier').map(({ id }) => id.name)
    : [];
}

function namedExports(statement) {
  if (statement.type === 'ExportNamedDeclaration') {
    return [
      ...statement.specifiers.map((specifier) => nameOf(specifier.exported)),
      ...(statement.declaration === null ? [] : declaredNames(statement.declaration)),
    ];
  }
  if (statement.type === 'ExportAllDeclaration' && statement.exported !== null) {
    return [nameOf(statement.exported)];
  }
  return statement.type === 'ExportDefaultDeclaration' ? ['default'] : [];
}

function starSources(statements, { checker, services }) {
  return statements
    .filter((statement) => statement.type === 'ExportAllDeclaration' && statement.exported === null)
    .map((statement) => {
      const source = services.esTreeNodeToTSNodeMap.get(statement.source);
      const target = source === undefined ? undefined : checker.getSymbolAtLocation(source);
      const names =
        target === undefined ? [] : checker.getExportsOfModule(target).map(({ name }) => name);
      return { statement, names: new Set(names) };
    });
}

function exportAnchors(program, context) {
  const named = new Map();
  for (const statement of program.body) {
    for (const name of namedExports(statement)) {
      named.set(name, statement);
    }
  }
  const stars = starSources(program.body, context);
  return (name) =>
    named.get(name) ?? stars.find(({ names }) => names.has(name))?.statement ?? program;
}

function leaksOf(checker, moduleSymbol) {
  const seen = new Set();
  return checker.getExportsOfModule(moduleSymbol).flatMap((exported) =>
    exportLeaks(checker, exported)
      .map((leak) => ({ ...leak, exportName: exported.name }))
      .filter(({ member, found }) => {
        const key = `${member}|${found.packageName}|${found.name}`;
        const fresh = !seen.has(key);
        seen.add(key);
        return fresh;
      }),
  );
}

function reportLeaks(context, program, checker) {
  const services = context.sourceCode.parserServices;
  const moduleSymbol = checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(program));
  if (moduleSymbol === undefined) {
    return;
  }
  const anchorOf = exportAnchors(program, { checker, services });
  const feature = path.basename(path.dirname(context.filename));
  for (const { member, found, exportName } of leaksOf(checker, moduleSymbol)) {
    context.report({
      node: anchorOf(exportName),
      messageId: found.kind,
      data: { member, type: found.name, package: found.packageName, feature },
    });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep persistence handles and request or response objects out of the exports of a feature index',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      persistence:
        "Take a repository or a port interface and return a domain type or a plain record from {{member}}: {{type}} from {{package}} is a persistence handle, so every importer of feature {{feature}} depends on its database session. Keep {{type}} in the feature's adapters behind the index; a factory (a function that returns an object synchronously) that receives it from the composition root is fine. An exception fits only when the feature deliberately hands out the handle, such as a shared transaction helper.",
      transport:
        'Take plain values and return a domain type or a plain record from {{member}}: {{type}} from {{package}} is a request or response object, so every importer of feature {{feature}} needs a live HTTP exchange. Read it in the route handler and pass the values in. An exception fits only when the export is a route handler or middleware the framework calls with a different first parameter.',
    },
  },
  create(context) {
    const program = context.sourceCode.parserServices?.program;
    if (!FEATURE_INDEX.test(context.filename.replaceAll('\\', '/')) || !program) {
      return {};
    }
    const checker = program.getTypeChecker();
    return {
      Program(node) {
        reportLeaks(context, node, checker);
      },
    };
  },
};
