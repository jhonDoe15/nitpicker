import { Parser } from 'web-tree-sitter';
import { loadGrammar } from '../../../../java/adapters/near-duplicates/grammar/load-grammar.mts';
import { goProjectUnits } from '../project-units.mts';

export async function goParser() {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await loadGrammar('go'));
  function parse(text, file = 'pkg/rules.go') {
    return goProjectUnits(parser, [{ file, text }]);
  }
  return Object.assign(parse, { parser });
}

export function inPackage(...lines) {
  return ['package rules', '', ...lines].join('\n');
}
