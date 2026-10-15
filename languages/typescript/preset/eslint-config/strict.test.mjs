import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../failure-messages/harness.mjs';
import strictConfig, { restrictedSyntaxFor } from './strict.mjs';

function messages(code, filename = 'src/fixture.ts') {
  return failureMessagesFor({ config: strictConfig, filename, code });
}

describe('strict escape-hatch rules', () => {
  it.each([
    ['as const', 'export const modes = ["a", "b"] as const;'],
    ['unknown', 'export function read(input: unknown) { return input; }'],
    ['undefined', 'export const value = undefined;'],
    ['strict null comparison', 'export function isNull(value: unknown) { return value === null; }'],
    [
      'strict null inequality',
      'export function present(value: unknown) { return value !== null; }',
    ],
    ['JSON.stringify replacer', 'export const text = JSON.stringify({ a: 1 }, null, 2);'],
    ['tool directive', '// prettier-ignore\nexport const value = 1;'],
    ['ts-check', '// @ts-check\nexport const value = 1;'],
    ['shebang', '#!/usr/bin/env node\nexport const value = 1;'],
  ])('allows %s', (_name, code) => {
    expect(messages(code)).toEqual([]);
  });

  it('does not apply to test files', () => {
    expect(messages('// note', 'src/fixture.test.ts')).toEqual([
      'No matching configuration found for src/fixture.test.ts.',
    ]);
  });
});

describe('strict declaration and control-flow rules', () => {
  it.each([
    ['type alias', 'export type Shape = { readonly size: number };'],
    ['string literal union', "export type Mode = 'read' | 'write';"],
    ['ambient module declaration', 'declare module "x" { export const a: number; }'],
    ['function declaration', 'export function read() { return 1; }'],
    ['arrow callback', 'export const doubled = [1, 2].map((value) => value * 2);'],
    ['Error subclass', 'export class ReadError extends Error {}'],
    ['qualified Error subclass', 'export class ReadError extends errors.BaseError {}'],
    ['named export', 'export const value = 1;'],
    ['early return', 'export function read(a) { if (a) { return 1; } return 2; }'],
    ['else without return', 'export function read(a) { if (a) { log(); } else { return 2; } }'],
    ['single ternary', 'export const value = a ? 1 : 2;'],
    [
      'an interface in a module augmentation',
      "declare module 'csstype' { interface Properties { '--progress'?: number } }\nexport {};",
    ],
    [
      'an interface in a global augmentation',
      'declare global { interface Window { app: number } }\nexport {};',
    ],
  ])('allows %s', (_name, code) => {
    expect(messages(code)).toEqual([]);
  });

  it.each([
    [
      'a global interface in an ambient declaration file',
      '/// <reference types="vite/client" />\ninterface ImportMetaEnv { readonly VITE_API: string }',
    ],
    [
      'a default export in a declared module',
      "declare module '*.svg' { const source: string; export default source; }",
    ],
  ])('allows %s', (_name, code) => {
    expect(messages(code, 'src/env.d.ts')).toEqual([]);
  });

  it('bans a default export outside a declared module', () => {
    expect(messages('const value = 1;\nexport default value;')).toHaveLength(1);
  });

  describe('the interface ban', () => {
    const messageStartingWith = (prefix) =>
      restrictedSyntaxFor().source.find(({ selector }) => selector.startsWith(prefix)).message;
    const interfaceBan = messageStartingWith('TSInterfaceDeclaration');
    const namespaceBan = messageStartingWith('TSModuleDeclaration');

    it('bans an interface', () => {
      expect(messages('export interface Shape { size: number }')).toEqual([interfaceBan]);
    });

    it.each([
      ['a declared namespace', 'declare namespace Shapes { interface Shape { size: number } }'],
      ['a module block', 'module Shapes { export interface Shape { size: number } }'],
    ])('bans an interface in %s, which is not an augmentation', (_name, code) => {
      expect(messages(code)).toEqual([namespaceBan, interfaceBan]);
    });
  });

  it('allows a default export in a config file', () => {
    expect(messages('export default { a: 1 };', 'src/app.config.ts')).toEqual([]);
  });

  it('still bans other forms in a config file', () => {
    expect(messages('enum A { B }', 'src/app.config.ts')).toHaveLength(1);
  });
});
