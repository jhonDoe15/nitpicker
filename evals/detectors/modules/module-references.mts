import path from 'node:path';
import { lineOf, type Node, type SourceFile, ts } from '../typescript.mts';

export type ModuleMocks = {
  imports: string[];
  mocks: { target: string; line: number }[];
  spies: { namespace: string; member: string; line: number }[];
  namespaces: Map<string, string>;
};

const MOCK_OWNERS = new Set(['vi', 'jest']);
const MOCK_METHODS = new Set(['mock', 'doMock']);

export function mocksOf(file: string, sourceFile: SourceFile): ModuleMocks {
  const imports: string[] = [];
  const mocks: ModuleMocks['mocks'] = [];
  const spies: ModuleMocks['spies'] = [];
  const namespaces = new Map<string, string>();
  function visit(node: Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.')) {
        imports.push(resolveSpecifier(file, specifier));
        const bindings = node.importClause?.namedBindings;
        if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
          namespaces.set(bindings.name.text, resolveSpecifier(file, specifier));
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression, name } = node.expression;
      if (ts.isIdentifier(expression) && MOCK_OWNERS.has(expression.text)) {
        const [first, second] = node.arguments;
        if (MOCK_METHODS.has(name.text) && first !== undefined && ts.isStringLiteralLike(first)) {
          mocks.push({
            target: resolveSpecifier(file, first.text),
            line: lineOf(sourceFile, node),
          });
        }
        if (name.text === 'spyOn' && first !== undefined && ts.isIdentifier(first)) {
          spies.push({
            namespace: first.text,
            member: second !== undefined && ts.isStringLiteralLike(second) ? second.text : '*',
            line: lineOf(sourceFile, node),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { imports, mocks, spies, namespaces };
}

export function resolveSpecifier(fromFile: string, specifier: string): string {
  return normalizeModule(path.posix.join(path.posix.dirname(fromFile), specifier));
}

export function normalizeModule(modulePath: string): string {
  return modulePath.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, '');
}

export function subjectCandidates(testFile: string, imports: readonly string[]): Set<string> {
  const stem = path.posix.basename(testFile).replace(/\.(test|spec)\.[cm]?[jt]sx?$/, '');
  const directory = path.posix.dirname(testFile);
  const parent = directory.endsWith('__tests__') ? path.posix.dirname(directory) : directory;
  const candidates = new Set([
    normalizeModule(path.posix.join(directory, stem)),
    normalizeModule(path.posix.join(parent, stem)),
  ]);
  for (const target of imports) {
    if (path.posix.basename(target) === stem) {
      candidates.add(target);
    }
  }
  return candidates;
}
