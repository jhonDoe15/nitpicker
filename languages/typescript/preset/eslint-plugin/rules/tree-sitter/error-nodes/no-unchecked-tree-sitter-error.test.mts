import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unchecked-tree-sitter-error.mts';

const ruleTester = typescriptRuleTester();
const WEB_TS = "import type { SyntaxNode } from 'web-tree-sitter';";

function lines(...parts: readonly string[]): string {
  return parts.join('\n');
}

function failing(code: string) {
  return {
    code,
    errors: [{ messageId: 'uncheckedErrorNode' as const }],
  };
}

ruleTester.run('no-unchecked-tree-sitter-error', rule, {
  valid: cases([
    lines(
      "import { something } from 'other-lib';",
      'type Item = { text: string };',
      'type Node = { children: Item[]; namedChildren: Item[]; childForFieldName(k: string): Item };',
      'function walk(node: Node) {',
      '  const names = node.children.map((c) => c.text);',
      '  const first = node.namedChildren[0];',
      '  for (const child of node.namedChildren) names.push(child.text);',
      "  return [first, node.childForFieldName('name').text, ...names];",
      '}',
    ),
    lines(
      WEB_TS,
      'function collect(node: SyntaxNode): string[] {',
      '  if (node.hasError) return [];',
      '  return node.namedChildren.map((child) => child.text);',
      '}',
    ),
    lines(
      "import Parser from 'tree-sitter';",
      'function collect(node: Parser.SyntaxNode): string[] {',
      '  if (node.hasError()) return [];',
      '  const out: string[] = [];',
      '  for (const child of node.children) out.push(child.text);',
      '  return out;',
      '}',
    ),
    lines(
      "import type { SyntaxNode } from 'node-tree-sitter';",
      'function collect(node: SyntaxNode): string[] {',
      '  return node.namedChildren',
      '    .filter((child) => !child.isError && !child.isMissing)',
      '    .map((child) => child.text);',
      '}',
    ),
    lines(
      WEB_TS,
      'function collect(node: SyntaxNode): string[] {',
      '  const out: string[] = [];',
      '  for (const child of node.namedChildren) {',
      "    if (child.type === 'ERROR' || child.type === 'MISSING') continue;",
      '    out.push(child.text);',
      '  }',
      '  return out;',
      '}',
    ),
    lines(
      WEB_TS,
      'function describeNode(node: SyntaxNode): string[] {',
      '  const out: string[] = [];',
      '  for (const child of node.namedChildren) {',
      "    switch (child.type) { case 'ERROR': continue; default: out.push(child.text); }",
      '  }',
      '  return out;',
      '}',
    ),
    lines(
      WEB_TS,
      'function nameOfNode(node: SyntaxNode): string | undefined {',
      '  if (node.hasError) return undefined;',
      "  return node.childForFieldName('name')?.text;",
      '}',
    ),
    lines(
      WEB_TS,
      'function nameOfNode(node: SyntaxNode): string | undefined {',
      "  return node.childForFieldName('name')?.text;",
      '}',
    ),
    lines(
      WEB_TS,
      'function nameOfNode(node: SyntaxNode): string | undefined {',
      "  const field = node.childForFieldName('name');",
      '  if (field === null) return undefined;',
      '  return field.text;',
      '}',
    ),
    lines(
      WEB_TS,
      'function isBroken(node: SyntaxNode): boolean { return node.hasError || node.isError; }',
      'function collect(node: SyntaxNode): string[] {',
      '  if (isBroken(node)) return [];',
      '  return node.namedChildren.map((child) => child.text);',
      '}',
    ),
    lines(
      WEB_TS,
      'class Extractor {',
      '  private hasSyntaxIssue(node: SyntaxNode): boolean { return node.isMissing || node.hasError; }',
      '  extract(node: SyntaxNode): string[] {',
      '    if (this.hasSyntaxIssue(node)) return [];',
      '    return node.namedChildren.map((child) => child.text);',
      '  }',
      '}',
    ),
    lines(
      WEB_TS,
      'function outer(root: SyntaxNode): string[] {',
      '  if (root.hasError) return [];',
      "  return root.namedChildren.map((child) => child.childForFieldName('name').text);",
      '}',
    ),
    lines(
      WEB_TS,
      'function hasChildren(node: SyntaxNode): boolean { return node.namedChildren.length > 0; }',
    ),
    lines(
      WEB_TS,
      'function collect({ hasError, namedChildren }: SyntaxNode): string[] {',
      '  if (hasError) return [];',
      '  return namedChildren.map((child) => child.text);',
      '}',
    ),
  ]),
  invalid: [
    failing(
      lines(
        "import Parser from 'tree-sitter';",
        'function collect(node: Parser.SyntaxNode): string[] {',
        '  return node.children.map((child) => child.text);',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function firstChild(node: SyntaxNode): SyntaxNode { return node.namedChildren[0]; }',
      ),
    ),
    failing(
      lines(
        "import type { SyntaxNode } from 'node-tree-sitter';",
        'function collect(node: SyntaxNode): string[] {',
        '  const out: string[] = [];',
        '  for (const child of node.namedChildren) out.push(child.text);',
        '  return out;',
        '}',
      ),
    ),
    failing(
      lines(
        "const Parser = require('tree-sitter');",
        'function collect(node: { namedChildren: { text: string }[] }): string[] {',
        '  const out: string[] = [];',
        '  node.namedChildren.forEach((child) => { out.push(child.text); });',
        '  return out;',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        "function nameOfNode(node: SyntaxNode): string { return node.childForFieldName('name').text; }",
      ),
    ),
    failing(
      lines(
        WEB_TS,
        "function nameOfNode(node: SyntaxNode): string { return node.childForFieldName('name')!.text; }",
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function nameOfNode(node: SyntaxNode | undefined): string | undefined {',
        "  return node?.childForFieldName('name').text;",
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function firstChild(node: SyntaxNode): SyntaxNode {',
        '  const kids = node.namedChildren;',
        '  return kids[0];',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function firstChild(node: SyntaxNode): SyntaxNode {',
        '  const [first] = node.namedChildren;',
        '  return first;',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function collect(node: SyntaxNode): string[] {',
        '  const { namedChildren } = node;',
        '  const out: string[] = [];',
        '  for (const child of namedChildren) out.push(child.text);',
        '  return out;',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function safe(node: SyntaxNode): string[] {',
        '  if (node.hasError) return [];',
        '  return node.namedChildren.map((child) => child.text);',
        '}',
        'function unsafe(node: SyntaxNode): string[] {',
        '  return node.namedChildren.map((child) => child.text);',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function collect(node: SyntaxNode, log: (level: string, msg: string) => void): string[] {',
        "  log('ERROR', node.type);",
        '  return node.namedChildren.map((child) => child.text);',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'function nested(node: SyntaxNode): SyntaxNode[] {',
        '  return node.namedChildren.map((child) => child.children[0]);',
        '}',
      ),
    ),
    failing(
      lines(
        WEB_TS,
        'class Walker {',
        '  identifiers(node: SyntaxNode): SyntaxNode[] {',
        "    return node.namedChildren.filter((child) => child.type === 'identifier');",
        '  }',
        '}',
      ),
    ),
  ],
});
