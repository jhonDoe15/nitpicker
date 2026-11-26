import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unknown-tree-sitter-field.mts';

const tester = typescriptRuleTester();

const NODE_TYPES = [
  { type: 'instanceof_expression', named: true, fields: { left: {}, name: {}, right: {} } },
  { type: 'type_pattern', named: true },
  { type: 'method_declaration', named: true, fields: { name: {}, parameters: {} } },
];

function project(withGrammar: boolean, dependency: string | undefined): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tree-sitter-fields-'));
  mkdirSync(path.join(root, 'src'));
  if (withGrammar) {
    const directory = path.join(root, 'node_modules', 'tree-sitter-java', 'src');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'node-types.json'), JSON.stringify(NODE_TYPES));
  }
  const dependencies = dependency === undefined ? {} : { [dependency]: '1.0.0' };
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
  return path.join(root, 'src', 'walk.mts');
}

function nestedProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tree-sitter-fields-'));
  mkdirSync(path.join(root, 'src'));
  for (const dialect of ['typescript', 'tsx']) {
    const directory = path.join(root, 'node_modules', 'tree-sitter-typescript', dialect, 'src');
    mkdirSync(directory, { recursive: true });
    const fields = dialect === 'tsx' ? { jsx_name: {} } : { return_type: {} };
    writeFileSync(
      path.join(directory, 'node-types.json'),
      JSON.stringify([{ type: 'function_declaration', named: true, fields }]),
    );
  }
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { 'tree-sitter-typescript': '1.0.0' } }),
  );
  return path.join(root, 'src', 'walk.mts');
}

const withGrammar = project(true, 'tree-sitter-java');
const withoutGrammar = project(false, 'tree-sitter-java');
const nested = nestedProject();
const noHint = project(true, undefined);

const HEAD = "import { Parser } from 'web-tree-sitter';\n";

function valid(code: string, filename = withGrammar) {
  return { filename, code: HEAD + code };
}

function invalid(code: string, filename = withGrammar) {
  return { filename, code: HEAD + code, errors: [{ messageId: 'unknownField' as const }] };
}

tester.run('no-unknown-tree-sitter-field', rule, {
  valid: [
    valid("function f(node) { return node.childForFieldName('name'); }"),
    valid("function f(node) { return node.childrenForFieldName('parameters'); }"),
    valid('function f(node) { return node.childForFieldName(field); }'),
    valid(
      "function f(node) { return node.type === 'instanceof_expression' ? node.childForFieldName('name') : null; }",
    ),
    valid(
      "function f(node) { if (node.type === 'instanceof_expression' && node.namedChildren.length > 0) { return node.childForFieldName('name'); } }",
    ),
    valid("function f(node) { return node.childForFieldName('anything'); }", withoutGrammar),
    valid("function f(node) { return node.childForFieldName('anything'); }", noHint),
    valid("function f(cursor) { return cursor.currentFieldName === 'name'; }"),
    valid(
      "function f(node) { return node.type === 'unknown_type' && node.childForFieldName('name'); }",
    ),
    {
      filename: withGrammar,
      code: "function f(node) { return node.childForFieldName('anything'); }",
    },
    valid(
      "function f(node) { if (node.type === 'type_pattern') { return 1; } return node.childForFieldName('name'); }",
    ),
    valid("function f(node) { return node.childForFieldName('return_type'); }", nested),
    valid("function f(node) { return node.childForFieldName('jsx_name'); }", nested),
    valid(
      "function f(node) { switch (node.type) { case 'instanceof_expression': return node.childForFieldName('name'); } }",
    ),
    valid(
      "function f(node) { switch (node.type) { case 'type_pattern': case 'instanceof_expression': return node.childForFieldName('name'); } }",
    ),
    valid(
      "function f(node) { switch (node.type) { case 'type_pattern': return 1; default: return node.childForFieldName('name'); } }",
    ),
    valid(
      "function f(node) { if (node.type !== 'instanceof_expression') { return null; } return node.childForFieldName('name'); }",
    ),
    valid(
      "function f(node) { if (node.type !== 'type_pattern') return null; return node.childForFieldName('name'); }",
      noHint,
    ),
    valid(
      "function f(c) { return c.nodeType === 'instanceof_expression' && c.currentFieldName === 'name'; }",
    ),
    valid(
      "function f(node) { if (node.type === 'type_pattern') { node = node.parent; return node.childForFieldName('name'); } }",
    ),
    valid(
      "function f(node) { if (node.type !== 'type_pattern') return null; node = node.parent; return node.childForFieldName('name'); }",
    ),
  ],
  invalid: [
    invalid("function f(node) { return node.childForFieldName('nme'); }", nested),
    invalid(
      "function f(node) { switch (node.type) { case 'type_pattern': return node.childForFieldName('name'); } }",
    ),
    invalid(
      "function f(node) { switch (node.nodeType) { case 'type_pattern': case 'method_declaration': return node.childForFieldName('left'); } }",
    ),
    invalid(
      "function f(node) { if (node.type !== 'type_pattern') { return null; } return node.childForFieldName('name'); }",
    ),
    invalid(
      "function f(node) { if (node.type !== 'type_pattern') throw new Error('x'); return node.childForFieldName('name'); }",
    ),
    invalid(
      "function f(c) { return c.nodeType === 'type_pattern' && c.currentFieldName === 'name'; }",
    ),
    invalid("function f(node) { return node.childForFieldName('nme'); }"),
    invalid("function f(node) { return node.childrenForFieldName('declarator'); }"),
    invalid("function f(cursor) { return cursor.currentFieldName === 'declarator'; }"),
    invalid("function f(cursor) { return 'declarator' !== cursor.currentFieldName; }"),
    invalid(
      "function f(node) { return node.type === 'type_pattern' ? node.childForFieldName('name') : null; }",
    ),
    invalid(
      "function f(node) { if (node.type === 'type_pattern') { return node.childForFieldName('name'); } }",
    ),
    invalid(
      "function f(node) { return node.type === 'type_pattern' && node.childForFieldName('name'); }",
    ),
    invalid('function f(node) { return node.childForFieldName(`nme`); }'),
    {
      filename: noHint,
      code: "import { Parser } from 'web-tree-sitter';\nimport 'tree-sitter-java';\nconst x = (n) => n.childForFieldName('nme');",
      errors: [{ messageId: 'unknownField' as const }],
    },
    {
      filename: noHint,
      code: "import Parser from 'tree-sitter';\nconst file = 'tree-sitter-java.wasm';\nconst x = (n) => n.childForFieldName('nme');",
      errors: [{ messageId: 'unknownField' as const }],
    },
  ],
});
