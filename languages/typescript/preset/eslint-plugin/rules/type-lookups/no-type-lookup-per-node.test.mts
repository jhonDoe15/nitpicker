import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-type-lookup-per-node.mts';

const ruleTester = typescriptRuleTester();
const TS = "import ts from 'typescript';\nconst wanted = new Set();\nconst calls = new Map();\n";

function listener(selector: string, body: string): string {
  return `${TS}export const rule = { create(context) { return { ${selector}(node) { ${body} } }; } };`;
}

function visitor(body: string): string {
  return `${TS}function visit(node) { ${body} ts.forEachChild(node, visit); }`;
}

ruleTester.run('no-type-lookup-per-node', rule, {
  valid: cases([
    `${TS}for (const node of everyNode(file)) {
      if (ts.isPropertyAccessExpression(node) && wantedNames.has(node.name.text)) {
        const symbol = checker.getSymbolAtLocation(node.name);
        if (symbol && wanted.has(symbol)) record(node);
      }
    }`,
    visitor('const type = checker.getTypeAtLocation(node); if (isString(type)) return;'),
    visitor('const symbol = checker.getSymbolAtLocation(node); if (!symbol) return;'),
    visitor(
      'const symbol = checker.getSymbolAtLocation(node); if (node.kind === 1) return symbol;',
    ),
    visitor('const symbol = checker.getSymbolAtLocation(node); if (classify(node)) return;'),
    visitor(
      'const symbol = checker.getSymbolAtLocation(node); record(symbol); if (!node.name) return;',
    ),
    listener(
      'Identifier',
      'const symbol = services.getSymbolAtLocation(node); if (symbol && wanted.has(symbol)) report(node, symbol.name);',
    ),
    listener(
      'Identifier',
      'const local = new Set(); if (local.has(services.getSymbolAtLocation(node))) report(node);',
    ),
    listener(
      'MemberExpression',
      'if (!wantedNames.has(node.property.name)) return; if (wanted.has(services.getSymbolAtLocation(node.property))) report(node);',
    ),
    listener(
      'ClassDeclaration',
      'const symbol = services.getSymbolAtLocation(node); if (!node.id) return;',
    ),
    'export function check(node) { const symbol = checker.getSymbolAtLocation(node); if (!node.name) return; }',
    `${TS}function visit(node) { const symbol = checker.getSymbolAtLocation(node); if (!node.name) return; }`,
    `${TS}for (const node of nodes) { items.forEach((item) => { const s = checker.getSymbolAtLocation(item); if (!item.name) return; }); }`,
    `${TS}for (const node of [checker.getSymbolAtLocation(root)]) { if (!node) continue; }`,
    visitor('const symbol = checker.getSymbolAtLocation(node.name); record(symbol ?? fallback);'),
    `${TS}export const rule = { create(context) { const targets = new Map(); return {
      VariableDeclarator(node) { targets.set(services.getSymbolAtLocation(node.id), node.id.name); },
      Identifier(node) {
        const symbol = services.getSymbolAtLocation(node);
        if (symbol && targets.has(symbol)) report(node);
      },
    }; } };`,
    visitor(
      'if (wanted.has(checker.getSymbolAtLocation(node.name))) record(node); wanted.add(node);',
    ),
    visitor(
      'let i = 0; while (i++ < 3) { const symbol = checker.getSymbolAtLocation(node); if (!node.name) continue; use(symbol); }',
    ),
  ]),
  invalid: [
    {
      code: visitor('let symbol = checker.getSymbolAtLocation(node); if (!node.name) return;'),
      errors: [{ messageId: 'beforeTest' }],
    },
    {
      code: visitor(
        'if (wanted.has(checker.getSymbolAtLocation(node.name))) record(node); else other(node);',
      ),
      errors: [{ messageId: 'beforeNameFilter' }],
    },
    {
      code: listener(
        'MemberExpression',
        "const type = services.getTypeAtLocation(node.object); if (node.property.name !== 'then') return;",
      ),
      errors: [
        { messageId: 'beforeTest', data: { method: 'getTypeAtLocation', walk: 'lint listener' } },
      ],
    },
    {
      code: visitor(
        'const symbol = checker.getSymbolAtLocation(node); const name = node.getText(); if (!names.has(name)) return;',
      ),
      errors: [
        { messageId: 'beforeTest', data: { method: 'getSymbolAtLocation', walk: 'tree visitor' } },
      ],
    },
    {
      code: `${TS}for (const node of nodes) { const symbol = checker.getSymbolAtLocation(node); if (!ts.isIdentifier(node)) continue; use(symbol); }`,
      errors: [{ messageId: 'beforeTest', data: { method: 'getSymbolAtLocation', walk: 'loop' } }],
    },
    {
      code: `${TS}for (const node of everyNode(file)) {
        if (ts.isPropertyAccessExpression(node)) {
          const symbol = checker.getSymbolAtLocation(node.name);
          if (symbol && wanted.has(symbol)) record(node);
        }
      }`,
      errors: [
        { messageId: 'beforeNameFilter', data: { method: 'getSymbolAtLocation', walk: 'loop' } },
      ],
    },
    {
      code: listener(
        'Identifier',
        'if (wanted.has(services.getSymbolAtLocation(node))) context.report({ node });',
      ),
      errors: [{ messageId: 'beforeNameFilter' }],
    },
    {
      code: `${TS}ts.forEachChild(file, function walk(node) {
        if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
          const symbol = checker.getSymbolAtLocation(node.name);
          if (!symbol) return;
          const entry = calls.get(symbol);
          if (entry !== undefined) entry.push(node);
        }
      });`,
      errors: [{ messageId: 'beforeNameFilter' }],
    },
  ],
});
