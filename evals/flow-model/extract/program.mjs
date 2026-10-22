import ts from 'typescript';

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
