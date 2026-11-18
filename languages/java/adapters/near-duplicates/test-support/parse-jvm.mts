import { Parser, type Node } from 'web-tree-sitter';
import type { Unit } from '../jvm-types.mts';
import { present } from '../tree/nodes.mts';
import { loadGrammar } from '../grammar/load-grammar.mts';
import { kotlinUnits } from '../kotlin/units.mts';
import { javaUnits } from '../tree/units.mts';

export type JvmParser = (text: string, file: string) => Unit[];

async function jvmParser(
  grammar: 'java' | 'kotlin',
  unitsOf: (program: Node, file: string) => Unit[],
): Promise<JvmParser> {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await loadGrammar(grammar));
  return (text, file) => {
    const tree = present(parser.parse(text));
    try {
      return unitsOf(tree.rootNode, file);
    } finally {
      tree.delete();
    }
  };
}

export function javaParser(): Promise<JvmParser> {
  return jvmParser('java', javaUnits);
}

export function kotlinParser(): Promise<JvmParser> {
  return jvmParser('kotlin', kotlinUnits);
}
