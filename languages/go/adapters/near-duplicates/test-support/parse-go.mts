import { Parser } from 'web-tree-sitter';
import { loadGrammar } from '../../../../java/adapters/near-duplicates/grammar/load-grammar.mts';
import { goProjectUnits } from '../project-units.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import type { GoUnit } from '../types/go-types.mts';

export type RuleFindings = (
  units: readonly GoUnit[],
  context: { readonly analyzerName: string; readonly isExcepted: () => boolean },
) => readonly Pick<Finding, 'location' | 'message'>[];

export type GoParse = ((text: string, file?: string) => GoUnit[]) & { readonly parser: Parser };

export async function goParser(): Promise<GoParse> {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await loadGrammar('go'));
  function parse(text: string, file = 'pkg/rules.go'): GoUnit[] {
    return goProjectUnits(parser, [{ file, text }]);
  }
  return Object.assign(parse, { parser });
}

export function inPackage(...lines: readonly string[]): string {
  return ['package rules', '', ...lines].join('\n');
}
