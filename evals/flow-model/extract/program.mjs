import ts from 'typescript';
import { depthFirst } from '../../../shared/traversal.mjs';

const OPTIONS = {
  allowJs: true,
  noLib: true,
  noResolve: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  types: [],
};

function scriptKind(file) {
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function memoryHost(virtualPath, sourceFile) {
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

function childrenOf(node) {
  return node.getChildren();
}

function redeclaresBinding(sourceFile, diagnostic) {
  if (diagnostic.code !== DUPLICATE_IDENTIFIER) {
    return diagnostic.code === BLOCK_SCOPED_REDECLARATION;
  }
  const identifier = [...depthFirst(sourceFile, childrenOf)].find(
    (node) => ts.isIdentifier(node) && node.getStart() === diagnostic.start,
  );
  return identifier !== undefined && BINDINGS.some((test) => test(identifier.parent));
}

function rejectInvalid(program, sourceFile) {
  const redeclared = program
    .getSemanticDiagnostics(sourceFile)
    .filter((diagnostic) => redeclaresBinding(sourceFile, diagnostic));
  const [first] = [...program.getSyntacticDiagnostics(sourceFile), ...redeclared];
  if (first !== undefined) {
    const message = ts.flattenDiagnosticMessageText(first.messageText, ' ');
    throw new Error(`flow-model: ${sourceFile.fileName.slice(1)} is not valid source: ${message}`);
  }
}

export function loadProgram({ file, text }) {
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

export function declarationOf(checker, identifier) {
  const parent = identifier.parent;
  const symbol =
    ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
      ? checker.getShorthandAssignmentValueSymbol(parent)
      : checker.getSymbolAtLocation(identifier);
  return symbol?.declarations?.[0];
}

export function locationOf(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}
