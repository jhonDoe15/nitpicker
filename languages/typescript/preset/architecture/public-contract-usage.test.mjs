import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { findUnusedPublicContractMethods } from './public-contract-usage.mjs';

const IMPLEMENTED_PORT =
  'export interface Port { required(): void; optional(): void; } export class Implementation implements Port { required() {} optional() {} }';

function analyzeFixture(consumer, testConsumer = '', { contract = IMPLEMENTED_PORT, spy } = {}) {
  const sources = new Map([
    ['/contract.ts', contract],
    ['/consumer.ts', `import { Implementation, Port } from "./contract"; ${consumer}`],
    ['/consumer.test.ts', `import { Implementation } from "./contract"; ${testConsumer}`],
  ]);
  const host = ts.createCompilerHost({ noLib: true });
  host.getSourceFile = (fileName, languageVersion) =>
    sources.has(fileName)
      ? ts.createSourceFile(fileName, sources.get(fileName), languageVersion, true)
      : undefined;
  host.fileExists = (fileName) => sources.has(fileName);
  host.readFile = (fileName) => sources.get(fileName);
  host.resolveModuleNameLiterals = (literals, containingFile) =>
    literals.map((literal) => ({
      resolvedModule: {
        resolvedFileName: path.resolve(path.dirname(containingFile), `${literal.text}.ts`),
        extension: ts.Extension.Ts,
      },
    }));
  const program = ts.createProgram(
    [...sources.keys()],
    { noLib: true, module: ts.ModuleKind.CommonJS },
    host,
  );
  if (spy) {
    const getTypeChecker = program.getTypeChecker.bind(program);
    program.getTypeChecker = () => {
      const checker = getTypeChecker();
      return new Proxy(checker, {
        get(target, name) {
          if (name === 'getSymbolAtLocation') return (...arguments_) => spy(name, arguments_);
          return Reflect.get(target, name);
        },
      });
    };
  }
  return findUnusedPublicContractMethods(program, { sourceRoot: '/' });
}

it('reports unused public methods without counting unrelated names or test-only consumers', () => {
  expect(
    analyzeFixture(
      'new Implementation().required(); const unrelated = { optional() {} }; unrelated.optional();',
      'new Implementation().optional();',
    ),
  ).toEqual([{ file: 'contract.ts', contract: 'Port', method: 'optional' }]);
});

it('accepts interface-typed consumers and concrete consumers', () => {
  expect(
    analyzeFixture(
      'const port: Port = new Implementation(); port.required(); new Implementation().optional();',
    ),
  ).toEqual([]);
});

it('recognizes method references passed through destructuring', () => {
  expect(
    analyzeFixture('const { required, optional: run } = new Implementation(); required(); run();'),
  ).toEqual([]);
});

it('recognizes literal element access through the public interface', () => {
  expect(
    analyzeFixture(
      "const port: Port = new Implementation(); port['required'](); port['optional']();",
    ),
  ).toEqual([]);
});

it('does not treat self-calls as external consumers of a public contract', () => {
  expect(
    analyzeFixture(
      'class Adapter implements Port { required() { this.optional(); } optional() {} } new Adapter().required();',
    ),
  ).toEqual([{ file: 'contract.ts', contract: 'Port', method: 'optional' }]);
});

it('looks up no symbols when no class implements an exported interface', () => {
  const lookups = [];
  const consumer = 'const value = { run() {} }; value.run(); const { run } = value; run();';
  const contract =
    'export interface Port { required(): void; } export class Plain { required() {} }';
  expect(
    analyzeFixture(consumer, '', {
      contract,
      spy: (name) => {
        lookups.push(name);
      },
    }),
  ).toEqual([]);
  expect(lookups).toEqual([]);
});
