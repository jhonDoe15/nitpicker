import type { ModuleBody, ModuleDeclaration, Node, SourceFile, Statement } from 'typescript';
import { ts } from './typed.mts';
import type { NamespaceScope as Scope, ScopedStatement } from './scope-types.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

function hasExportModifier(declaration: Node): boolean {
  return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
}

function namespaceBody(statement: Statement): ModuleBody | undefined {
  const isNamespace =
    ts.isModuleDeclaration(statement) &&
    ts.isIdentifier(statement.name) &&
    (statement.flags & ts.NodeFlags.GlobalAugmentation) === 0;
  return isNamespace ? statement.body : undefined;
}

function innerScope(statement: ModuleDeclaration, body: ModuleBody, scope: Scope) {
  const prefix = `${scope.prefix}${statement.name.text}.`;
  const anchor = scope.anchor ?? statement;
  if (ts.isModuleDeclaration(body)) {
    return {
      statements: [body],
      scope: { prefix, anchor, isExported: () => scope.isExported(statement) },
    };
  }
  return {
    statements: ts.isModuleBlock(body) ? body.statements : [],
    scope: { prefix, anchor, isExported: exportedWithin(statement, scope) },
  };
}

function exportedWithin(statement: ModuleDeclaration, scope: Scope) {
  return (declaration: Node) => scope.isExported(statement) && hasExportModifier(declaration);
}

function scoped(statements: readonly Statement[], scope: Scope) {
  return statements.map((statement) => ({ statement, scope }));
}

function expand(statements: readonly Statement[], scope: Scope): ScopedStatement[] {
  const pending = scoped(statements, scope);
  const flat: ScopedStatement[] = [];
  for (const entry of pending) {
    const body = namespaceBody(entry.statement);
    if (body === undefined || !ts.isModuleDeclaration(entry.statement)) {
      flat.push({ statement: entry.statement, ...entry.scope });
    } else {
      const inner = innerScope(entry.statement, body, entry.scope);
      appendAll(pending, scoped(inner.statements, inner.scope));
    }
  }
  return flat.toSorted((left, right) => left.statement.pos - right.statement.pos);
}

export function scopedStatements(file: {
  sourceFile: SourceFile;
  exported: ReadonlySet<Node>;
}): ScopedStatement[] {
  return expand(file.sourceFile.statements, {
    prefix: '',
    anchor: undefined,
    isExported: (declaration) => file.exported.has(declaration),
  });
}
