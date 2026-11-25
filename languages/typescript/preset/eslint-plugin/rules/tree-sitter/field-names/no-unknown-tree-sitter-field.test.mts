import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unknown-tree-sitter-field.mts';

const tester = typescriptRuleTester();

const tempDir = mkdtempSync(path.join(tmpdir(), 'ts-field-names-'));
const tempNodeTypesPath = path.join(tempDir, 'node-types.json');
writeFileSync(
  tempNodeTypesPath,
  JSON.stringify([
    { type: 'custom_node', named: true, fields: { target: { multiple: false, required: true } } },
    { type: 'empty_node', named: true, fields: {} },
  ]),
);

const CUSTOM_FIELDS = {
  grammarFields: {
    type_pattern: [],
    instanceof_expression: ['left', 'right', 'name'],
  },
} as const;

function invalidUnknown(code: string, options?: [Record<string, unknown>]) {
  return options === undefined
    ? { code, errors: [{ messageId: 'unknownField' as const }] }
    : { code, options, errors: [{ messageId: 'unknownField' as const }] };
}

function invalidNarrowed(code: string, options?: [Record<string, unknown>]) {
  return options === undefined
    ? { code, errors: [{ messageId: 'unknownFieldForNodeType' as const }] }
    : { code, options, errors: [{ messageId: 'unknownFieldForNodeType' as const }] };
}

tester.run('no-unknown-tree-sitter-field', rule, {
  valid: [
    'export function read(node: { childForFieldName(name: string): unknown }) { ' +
      'return node.childForFieldName("anything_at_all"); }',
    'import Parser from "web-tree-sitter"; ' +
      'export function read(node: Parser.SyntaxNode) { return node.childForFieldName("anything"); }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(node: any, key: string) { return [Java, node.childForFieldName(key)]; }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(node: any) { return [Java, node.childForFieldName("name")]; }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(node: any) { return [Java, node.childrenForFieldName("declarator")]; }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(node: any) { ' +
      'if (node.type === "instanceof_expression") { return [Java, node.childForFieldName("name")]; } return null; }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(node: any) { ' +
      'switch (node.type) { case "instanceof_expression": return [Java, node.childForFieldName("name")]; ' +
      'default: return null; } }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(node: any) { ' +
      'if (node.type === "type_pattern" || node.type === "instanceof_expression") { ' +
      'return [Java, node.childForFieldName("name")]; } return null; }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(parent: any, child: any) { ' +
      'if (parent.type === "type_pattern") { return [Java, child.childForFieldName("name")]; } return null; }',
    'import Java from "tree-sitter-java"; ' +
      'export function read(node: any) { ' +
      'if (node.type === "type_pattern") { return null; } else { return [Java, node.childForFieldName("name")]; } }',
    'import Java from "tree-sitter-java"; ' +
      'export function check(cursor: any) { return [Java, cursor.currentFieldName === "name"]; }',
    'import Java from "tree-sitter-java"; ' +
      'export function check(fieldName: string) { return [Java, fieldName === "left"]; }',
    'import Java from "tree-sitter-java"; ' +
      'export function check(cursor: any) { ' +
      'switch (cursor.currentFieldName) { case "name": return Java; default: return null; } }',
    'import TypeScript from "tree-sitter-typescript"; ' +
      'export function read(node: any) { return [TypeScript, node.childForFieldName("return_type")]; }',
    'import Python from "tree-sitter-python"; ' +
      'export function read(node: any) { return [Python, node.childForFieldName("superclasses")]; }',
    'import Parser from "web-tree-sitter"; ' +
      'export async function read(node: any) { ' +
      'await Parser.Language.load("/grammars/tree-sitter-java.wasm"); return node.childForFieldName("name"); }',
    {
      code:
        'export function read(node: any) { ' +
        'if (node.type === "instanceof_expression") { return node.childForFieldName("right"); } return null; }',
      options: [CUSTOM_FIELDS],
    },
    {
      code:
        'export function read(node: any) { ' +
        'if (node.type === "custom_node") { return node.childForFieldName("target"); } return null; }',
      options: [{ nodeTypesPath: tempNodeTypesPath }],
    },
  ],
  invalid: [
    invalidUnknown(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { return [Java, node.childForFieldName("nonexistent")]; }',
    ),
    invalidUnknown(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { return [Java, node.childrenForFieldName("bogus")]; }',
    ),
    invalidUnknown(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { return [Java, node?.childForFieldName("bogus")]; }',
    ),
    invalidNarrowed(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { ' +
        'if (node.type === "type_pattern") { return [Java, node.childForFieldName("name")]; } return null; }',
    ),
    invalidNarrowed(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { ' +
        'switch (node.type) { case "type_pattern": return [Java, node.childForFieldName("name")]; ' +
        'default: return null; } }',
    ),
    invalidNarrowed(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { ' +
        'switch (node.type) { case "type_pattern": case "record_pattern": ' +
        'return [Java, node.childForFieldName("name")]; default: return null; } }',
    ),
    invalidNarrowed(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { ' +
        'if (node.type !== "type_pattern") { return null; } return [Java, node.childForFieldName("name")]; }',
    ),
    invalidNarrowed(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { ' +
        'return [Java, node.type === "type_pattern" && node.childForFieldName("name")]; }',
    ),
    invalidNarrowed(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { ' +
        'return [Java, node.type === "type_pattern" ? node.childForFieldName("name") : null]; }',
    ),
    invalidNarrowed(
      'import Java from "tree-sitter-java"; ' +
        'export function read(node: any) { ' +
        'if (node.type !== "type_pattern") { return null; } else { return [Java, node.childForFieldName("name")]; } }',
    ),
    invalidUnknown(
      'import Java from "tree-sitter-java"; ' +
        'export function check(cursor: any) { return [Java, cursor.currentFieldName === "bogus_field"]; }',
    ),
    invalidUnknown(
      'import Java from "tree-sitter-java"; ' +
        'export function check(cursor: any) { return [Java, "bogus_field" === cursor?.currentFieldName]; }',
    ),
    invalidUnknown(
      'import Java from "tree-sitter-java"; ' +
        'export function check(fieldName: string) { return [Java, fieldName === "bogus_field"]; }',
    ),
    invalidUnknown(
      'import Java from "tree-sitter-java"; ' +
        'export function check(cursor: any) { ' +
        'switch (cursor.currentFieldName) { case "bogus_field": return Java; default: return null; } }',
    ),
    invalidUnknown(
      'import Python from "tree-sitter-python"; ' +
        'export function read(node: any) { return [Python, node.childForFieldName("nonexistent")]; }',
    ),
    invalidUnknown(
      'import TypeScript from "tree-sitter-typescript"; ' +
        'export function read(node: any) { return [TypeScript, node.childForFieldName("nonexistent")]; }',
    ),
    invalidNarrowed(
      'import Parser from "web-tree-sitter"; ' +
        'export async function read(node: any) { ' +
        'await Parser.Language.load("/grammars/tree-sitter-java.wasm"); ' +
        'if (node.type === "type_pattern") { return node.childForFieldName("name"); } return null; }',
    ),
    invalidUnknown(
      'export function read(node: any) { return node.childForFieldName("missing"); }',
      [CUSTOM_FIELDS],
    ),
    invalidNarrowed(
      'export function read(node: any) { ' +
        'if (node.type === "type_pattern") { return node.childForFieldName("name"); } return null; }',
      [CUSTOM_FIELDS],
    ),
    invalidNarrowed(
      'export function read(node: any) { ' +
        'if (node.type === "empty_node") { return node.childForFieldName("target"); } return null; }',
      [{ nodeTypesPath: tempNodeTypesPath }],
    ),
  ],
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});
