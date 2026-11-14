import { Parser } from 'web-tree-sitter';
import { partialExtraction } from '../extract/partial/partial-extract.mjs';
import { METHOD, descendants, field } from '../extract/syntax.mjs';
import { loadGrammar } from '../grammar/load-grammar.mjs';

async function javaParser() {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await loadGrammar('java'));
  return parser;
}

export async function forcedPartial(text, { methods, runs, engineHoles = 0 }) {
  const parser = await javaParser();
  const tree = parser.parse(text);
  try {
    const nodes = methods.map((name) =>
      descendants(tree.rootNode).find(
        (node) => node.type === METHOD && field(node, 'name').text === name,
      ),
    );
    const result = partialExtraction({
      methods: nodes,
      runs,
      label: methods[0],
      engineHoles,
      root: tree.rootNode,
      text,
      claimed: new Set(),
    });
    return result.edits === undefined ? { declined: result.declined } : { edits: result.edits };
  } finally {
    tree.delete();
  }
}
