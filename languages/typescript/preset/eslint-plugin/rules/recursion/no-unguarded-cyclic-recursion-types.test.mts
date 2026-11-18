import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { typedTsProject } from '../../test-support/projects/typed-ts-project.mts';
import { rule } from './no-unguarded-cyclic-recursion.mts';

const DECLARATIONS = [
  'export interface Type { flags: number; types?: Type[]; target?: Type }',
  'export interface Node { kind: number; parent: Node }',
  'export interface TypeChecker { getTypeArguments(type: Type): readonly Type[] }',
].join('\n');

const project = typedTsProject('nitpicker-cyclic-types-', {
  typeScriptOnly: true,
  prepare(root) {
    const folder = path.join(root, 'node_modules', 'typescript', 'lib');
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'typescript.d.ts'), `${DECLARATIONS}\n`);
    writeFileSync(
      path.join(root, 'node_modules', 'typescript', 'package.json'),
      JSON.stringify({ name: 'typescript', version: '1.0.0', types: 'lib/typescript.d.ts' }),
    );
  },
});

function typed(code: string) {
  return {
    filename: project.write(code, 'ts'),
    code: `import type { Type, Node, TypeChecker } from 'typescript';\n${code}`,
  };
}

project.tester.run('no-unguarded-cyclic-recursion over the TypeScript API', rule, {
  valid: [
    'export function f(node: Node): number { return node.parent ? f(node.parent) : 0; }',
    'export function f(type: Type, seen = new Set<Type>()): boolean { if (seen.has(type)) return false; seen.add(type); return (type.types ?? []).some((t) => f(t, seen)); }',
    'export function f(type: Type, depth = 0): boolean { return depth < 5 && (type.types ?? []).some((t) => f(t, depth + 1)); }',
  ].map(typed),
  invalid: [
    'export function f(type: Type): boolean { return (type.types ?? []).some((t) => f(t)); }',
    'export function f(type: Type): boolean { for (const part of type.types ?? []) { if (f(part)) return true; } return false; }',
    'export function f(type: Type, checker: TypeChecker): boolean { return checker.getTypeArguments(type).some((a) => f(a, checker)); }',
    'export function f(type: Type): boolean { return type.target ? f(type.target) : false; }',
  ].map((code) => ({ ...typed(code), errors: [{ messageId: 'cyclic' as const }] })),
});
