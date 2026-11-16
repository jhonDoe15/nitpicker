import { Parser } from 'web-tree-sitter';
import type { Attempt, Edit, Span } from '../extract-types.mts';
import { partialExtraction } from '../extract/partial/partial-extract.mts';
import { METHOD, descendants, pairOf, present, required } from '../extract/syntax.mts';
import { loadGrammar } from '../grammar/load-grammar.mts';

async function javaParser(): Promise<Parser> {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await loadGrammar('java'));
  return parser;
}

export async function forcedPartial(
  text: string,
  {
    methods,
    runs,
    engineHoles = 0,
  }: { methods: readonly string[]; runs: readonly Span[]; engineHoles?: number },
): Promise<Attempt<{ edits: Edit[] }>> {
  const parser = await javaParser();
  const tree = present(parser.parse(text));
  try {
    const nodes = methods.map((name) =>
      descendants(tree.rootNode).find(
        (node) => node.type === METHOD && required(node, 'name').text === name,
      ),
    );
    const result = partialExtraction({
      methods: pairOf(nodes),
      runs,
      label: present(methods[0]),
      engineHoles,
      root: tree.rootNode,
      text,
      claimed: new Set(),
    });
    return result.declined === undefined ? { edits: result.edits } : { declined: result.declined };
  } finally {
    tree.delete();
  }
}
