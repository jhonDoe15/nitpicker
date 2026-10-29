import ts from 'typescript';

function hasExportModifier(declaration) {
  return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
}

function namespaceBody(statement) {
  const isNamespace =
    ts.isModuleDeclaration(statement) &&
    ts.isIdentifier(statement.name) &&
    (statement.flags & ts.NodeFlags.GlobalAugmentation) === 0;
  return isNamespace ? statement.body : undefined;
}

function innerScope(statement, scope) {
  const body = namespaceBody(statement);
  const prefix = `${scope.prefix}${statement.name.text}.`;
  const anchor = scope.anchor ?? statement;
  if (ts.isModuleDeclaration(body)) {
    return {
      statements: [body],
      scope: { prefix, anchor, isExported: () => scope.isExported(statement) },
    };
  }
  const isExported = (declaration) => scope.isExported(statement) && hasExportModifier(declaration);
  return { statements: body.statements, scope: { prefix, anchor, isExported } };
}

function expand(statements, scope) {
  return statements.flatMap((statement) => {
    if (namespaceBody(statement) === undefined) {
      return [{ statement, ...scope }];
    }
    const inner = innerScope(statement, scope);
    return expand(inner.statements, inner.scope);
  });
}

export function scopedStatements(file) {
  return expand(file.sourceFile.statements, {
    prefix: '',
    anchor: undefined,
    isExported: (declaration) => file.exported.has(declaration),
  });
}
