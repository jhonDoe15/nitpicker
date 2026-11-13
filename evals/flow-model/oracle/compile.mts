import vm from 'node:vm';
import ts from 'typescript';
import { findFunction } from '../extract/module-bindings.mts';
import { depthFirst } from '../model/traversal.mts';
import type { EntryFunction, RequireModule } from '../model/contract-types.mts';

type ExportsObject = Record<string, unknown>;
type ModuleFactory = (
  exports: ExportsObject,
  require: RequireModule,
  module: { exports: ExportsObject },
) => void;

function isAsyncLike(node: ts.Node): boolean {
  const asynchronous = (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(
    (item) => item.kind === ts.SyntaxKind.AsyncKeyword,
  );
  const generator = 'asteriskToken' in node && node.asteriskToken !== undefined;
  return ts.isFunctionLike(node) && (asynchronous || generator);
}

function childrenOf(node: ts.Node): readonly ts.Node[] {
  return node.getChildren();
}

function isModuleFactory(value: unknown): value is ModuleFactory {
  return typeof value === 'function';
}

function isEntryFunction(value: unknown): value is EntryFunction {
  return typeof value === 'function';
}

export function entryShape({ file, text, entry }: { file: string; text: string; entry: string }): {
  params: string[];
  async: boolean;
} {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const declaration = findFunction(sourceFile, entry);
  if (declaration === undefined) {
    throw new Error(`oracle: entry ${entry} is not a top-level function in ${file}`);
  }
  return {
    params: declaration.parameters.map((parameter) => parameter.name.getText(sourceFile)),
    async: depthFirst<ts.Node>(sourceFile, childrenOf).some(isAsyncLike),
  };
}

export function compileEntry({
  file,
  text,
  entry,
}: {
  file: string;
  text: string;
  entry: string;
}): (requireModule: RequireModule) => EntryFunction {
  const output = ts.transpileModule(text, {
    fileName: file.replace(/\.[cm]?[jt]s$/, '.ts'),
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const wrapped = `(function (exports, require, module) {\n${output}\nexports.__flowEntry = ${entry};\n})`;
  const script = new vm.Script(wrapped, { filename: file });
  const context = vm.createContext({});
  const factory: unknown = script.runInContext(context);
  if (!isModuleFactory(factory)) {
    throw new Error(`oracle: ${file} did not compile to a module function`);
  }
  return function load(requireModule) {
    const module: { exports: ExportsObject } = { exports: {} };
    factory(module.exports, requireModule, module);
    const loaded = module.exports['__flowEntry'];
    if (!isEntryFunction(loaded)) {
      throw new Error(`oracle: ${entry} in ${file} is not a function`);
    }
    return loaded;
  };
}
