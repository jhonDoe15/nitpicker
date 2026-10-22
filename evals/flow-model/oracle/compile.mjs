import vm from 'node:vm';
import ts from 'typescript';

export function parameterNames({ file, text, entry }) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const declaration = sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === entry,
  );
  if (declaration === undefined) {
    throw new Error(`oracle: entry ${entry} is not a top-level function declaration in ${file}`);
  }
  return declaration.parameters.map((parameter) => parameter.name.getText(sourceFile));
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
