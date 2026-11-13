import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import { javaUnits } from '../units.mjs';

const GRAMMAR = fileURLToPath(new URL('../../grammar/tree-sitter-java.wasm', import.meta.url));

export async function javaParser() {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load(GRAMMAR));
  return (text, file = 'Sample.java') => {
    const tree = parser.parse(text);
    try {
      return javaUnits(tree.rootNode, file);
    } finally {
      tree.delete();
    }
  };
}
