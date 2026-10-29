import vm from 'node:vm';
import ts from 'typescript';
import { depthFirst } from '../../../shared/traversal.mjs';

function isFunctionValue(node) {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function topLevelFunction(sourceFile, entry) {
  for (const statement of sourceFile.statements) {
    const named = ts.isFunctionDeclaration(statement) && statement.name?.text === entry;
    if (named && statement.body !== undefined) {
      return statement;
    }
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : [];
    const match = declarations.find(
      (item) => ts.isIdentifier(item.name) && item.name.text === entry,
    );
    if (match !== undefined && isFunctionValue(match.initializer)) {
      return match.initializer;
    }
  }
  return undefined;
}

function isAsyncLike(node) {
  const asynchronous = (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(
    (item) => item.kind === ts.SyntaxKind.AsyncKeyword,
  );
  return ts.isFunctionLike(node) && (asynchronous || node.asteriskToken !== undefined);
}

function childrenOf(node) {
  return node.getChildren();
}

export function entryShape({ file, text, entry }) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const declaration = topLevelFunction(sourceFile, entry);
  if (declaration === undefined) {
    throw new Error(`oracle: entry ${entry} is not a top-level function in ${file}`);
  }
  return {
    params: declaration.parameters.map((parameter) => parameter.name.getText(sourceFile)),
    async: [...depthFirst(sourceFile, childrenOf)].some(isAsyncLike),
  };
}

export function compileEntry({ file, text, entry }) {
  const output = ts.transpileModule(text, {
    fileName: file.replace(/\.[cm]?[jt]s$/, '.ts'),
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const wrapped = `(function (exports, require, module) {\n${output}\nexports.__flowEntry = ${entry};\n})`;
  const script = new vm.Script(wrapped, { filename: file });
  const context = vm.createContext({});
  const factory = script.runInContext(context);
  return function load(requireModule) {
    const module = { exports: {} };
    factory(module.exports, requireModule, module);
    return module.exports.__flowEntry;
  };
}
