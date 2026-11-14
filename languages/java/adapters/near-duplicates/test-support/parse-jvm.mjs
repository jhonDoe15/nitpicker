import { Parser } from 'web-tree-sitter';
import { loadGrammar } from '../grammar/load-grammar.mjs';
import { kotlinUnits } from '../kotlin/units.mjs';
import { javaUnits } from '../tree/units.mjs';

async function jvmParser(grammar, unitsOf) {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await loadGrammar(grammar));
  return (text, file) => {
    const tree = parser.parse(text);
    try {
      return unitsOf(tree.rootNode, file);
    } finally {
      tree.delete();
    }
  };
}

export function javaParser() {
  return jvmParser('java', javaUnits);
}

export function kotlinParser() {
  return jvmParser('kotlin', kotlinUnits);
}
