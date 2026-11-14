import ts from 'typescript';
import type { Loc, ProgramContext } from '../model/syntax-types.mts';
import { depthFirst } from '../model/traversal.mts';

const OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  noLib: true,
  noResolve: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  types: [],
};

function scriptKind(file: string): ts.ScriptKind {
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function memoryHost(virtualPath: string, sourceFile: ts.SourceFile): ts.CompilerHost {
  const host = ts.createCompilerHost(OPTIONS);
  host.getCurrentDirectory = () => '/';
  host.getSourceFile = (name) => (name === virtualPath ? sourceFile : undefined);
  host.fileExists = (name) => name === virtualPath;
  host.readFile = (name) => (name === virtualPath ? sourceFile.text : undefined);
  host.writeFile = () => undefined;
  return host;
}

const DUPLICATE_IDENTIFIER = 2300;
const BLOCK_SCOPED_REDECLARATION = 2451;
const BINDINGS = [
  ts.isVariableDeclaration,
  ts.isParameter,
  ts.isBindingElement,
  ts.isFunctionDeclaration,
  ts.isClassDeclaration,
];

function childrenOf(node: ts.Node): readonly ts.Node[] {
  return node.getChildren();
}

function redeclaresBinding(sourceFile: ts.SourceFile, diagnostic: ts.Diagnostic): boolean {
  if (diagnostic.code !== DUPLICATE_IDENTIFIER) {
    return diagnostic.code === BLOCK_SCOPED_REDECLARATION;
  }
  const identifier = depthFirst<ts.Node>(sourceFile, childrenOf).find(
    (node) => ts.isIdentifier(node) && node.getStart() === diagnostic.start,
  );
  return identifier !== undefined && BINDINGS.some((test) => test(identifier.parent));
}

function rejectInvalid(program: ts.Program, sourceFile: ts.SourceFile): void {
  const redeclared = program
    .getSemanticDiagnostics(sourceFile)
    .filter((diagnostic) => redeclaresBinding(sourceFile, diagnostic));
  const [first] = [...program.getSyntacticDiagnostics(sourceFile), ...redeclared];
  if (first !== undefined) {
    const message = ts.flattenDiagnosticMessageText(first.messageText, ' ');
    throw new Error(`flow-model: ${sourceFile.fileName.slice(1)} is not valid source: ${message}`);
  }
}

export function loadProgram({ file, text }: { file: string; text: string }): ProgramContext {
  const virtualPath = `/${file}`;
  const kind = scriptKind(file);
  const sourceFile = ts.createSourceFile(virtualPath, text, ts.ScriptTarget.ES2022, true, kind);
  const program = ts.createProgram({
    rootNames: [virtualPath],
    options: OPTIONS,
    host: memoryHost(virtualPath, sourceFile),
  });
  const loaded = program.getSourceFile(virtualPath);
  if (loaded === undefined) {
    throw new Error(`flow-model: ${file} was not loaded by the TypeScript program`);
  }
  rejectInvalid(program, loaded);
  return { sourceFile: loaded, checker: program.getTypeChecker() };
}

export function declarationOf(
  checker: ts.TypeChecker,
  identifier: ts.Identifier,
): ts.Declaration | undefined {
  const parent = identifier.parent;
  const symbol =
    ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
      ? checker.getShorthandAssignmentValueSymbol(parent)
      : checker.getSymbolAtLocation(identifier);
  return symbol?.declarations?.[0];
}

export function locationOf(sourceFile: ts.SourceFile, node: ts.Node): Loc {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}

export function bindingFieldName(element: ts.BindingElement): string | undefined {
  const name = element.propertyName ?? element.name;
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

export function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}
