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

function scoped(statements, scope) {
  return statements.map((statement) => ({ statement, scope }));
}

function expand(statements, scope) {
  const pending = scoped(statements, scope);
  const flat = [];
  for (const entry of pending) {
    if (namespaceBody(entry.statement) === undefined) {
      flat.push({ statement: entry.statement, ...entry.scope });
    } else {
      const inner = innerScope(entry.statement, entry.scope);
      pending.push(...scoped(inner.statements, inner.scope));
    }
  }
  return flat.toSorted((left, right) => left.statement.pos - right.statement.pos);
}

export function scopedStatements(file) {
  return expand(file.sourceFile.statements, {
    prefix: '',
    anchor: undefined,
    isExported: (declaration) => file.exported.has(declaration),
  });
}
