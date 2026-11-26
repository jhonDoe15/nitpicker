import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-tree-sitter-error-check.mts';

const tester = typescriptRuleTester();

const HEAD = "import type { Node } from 'web-tree-sitter';\n";

function valid(code: string) {
  return { code: HEAD + code };
}

function invalid(code: string) {
  return { code: HEAD + code, errors: [{ messageId: 'unhandledErrorNodes' as const }] };
}

tester.run('require-tree-sitter-error-check', rule, {
  valid: [
    {
      code: 'function parameters(method) { return method.childForFieldName("parameters").namedChildren.map(read); }',
    },
    valid('function name(node: Node) { return node.childForFieldName("name")?.text; }'),
    valid('function name(node: Node) { return node.childForFieldName("name") ?? undefined; }'),
    valid('function all(node: Node) { for (const child of node.children) { visit(child); } }'),
    valid('function all(node: Node) { return node.children.filter(isNamed); }'),
    valid('function texts(node: Node) { return node.namedChildren.map(({ text }) => text); }'),
    valid('function texts(node: Node) { return node.namedChildren.map(read); }'),
    valid('function pair(node: Node) { const [left, right] = node.namedChildren; return left; }'),
    valid('function first(node: Node) { return node.children[0]?.type; }'),
    valid(
      'function parameters(node: Node) { if (node.hasError) { return []; } return node.namedChildren[0]; }',
    ),
    valid(
      'function parameters(node: Node) { return node.namedChildren.filter((child) => child.type !== "ERROR").map(read); }',
    ),
    valid(
      'function type(node: Node) { if (node.isMissing) { return undefined; } return node.childForFieldName("type").text; }',
    ),
    valid(
      'function parameters(node: Node) { return node.namedChildren[0]; }\nfunction unit(node: Node) { if (node.hasError) { return undefined; } return parameters(node); }',
    ),
    valid(
      'const parameters = (node: Node) => node.namedChildren[0];\nconst middle = (node: Node) => parameters(node);\nfunction unit(node: Node) { if (node.hasError) { return; } return middle(node); }',
    ),
    valid(
      'class Reader { parameters(node: Node) { return node.namedChildren[0]; } run(node: Node) { if (node.isError) { return; } return this.parameters(node); } }',
    ),
    valid('export function parameters(node: Node) { return node.namedChildren[0]; }'),
    valid('export const parameters = (node: Node) => node.namedChildren[0];'),
    valid(
      'function parameters(node: Node) { return node.namedChildren[0]; }\nfunction unit(node: Node) { return parameters(node); }\nexport { unit };',
    ),
    valid('const first = (node: Node) => node.namedChildren.length;'),
  ],
  invalid: [
    invalid(
      'function parameters(method: Node) { return method.childForFieldName("parameters")!.namedChildren.map(read); }',
    ),
    invalid(
      'function parameters(method: Node) { return method.childForFieldName("parameters").namedChildren.map((parameter) => parameter.text); }',
    ),
    invalid(
      'function typeOf(parameter: Node) { return parameter.childForFieldName("type").text; }',
    ),
    invalid('const typeOf = (parameter: Node) => parameter.childForFieldName("type")!.text;'),
    invalid('function first(node: Node) { return node.children[0]; }'),
    invalid(
      'function names(node: Node) { return node.children.flatMap((child) => child.namedChildren); }',
    ),
    invalid(
      'function parameters(node: Node) { return node.namedChildren[0]; }\nfunction unit(node: Node) { return parameters(node); }',
    ),
    invalid(
      'function parameters(node: Node) { return node.namedChildren[0]; }\nfunction other(node: Node) { return node.hasError; }\nfunction unit(node: Node) { return parameters(node); }',
    ),
  ],
});
