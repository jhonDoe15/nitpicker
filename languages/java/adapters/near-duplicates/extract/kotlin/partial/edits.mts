import type { Edit } from '../../../extract-types.mts';
import { indentOf } from '../../../jvm-views.mts';
import { present } from '../../syntax.mts';
import {
  type ExtractedFunction,
  holeArguments,
  holeParameters,
  insertionAfter,
  replacedText,
} from '../align/render.mts';
import { modifierWords } from '../syntax.mts';
import type { Run } from './run.mts';
import type { Input } from '../../partial/partial-types.mts';
import type { Pair2, Side } from './types.mts';

type Found = { readonly helper: ExtractedFunction; readonly inputs: readonly Input[] };

export function bounds({ statements }: Run): { start: number; end: number } {
  return { start: present(statements[0]).startIndex, end: present(statements.at(-1)).endIndex };
}

function callText(side: number, { helper, inputs }: Found): string {
  const args = [
    ...inputs.map(({ names }) => present(names[side])),
    ...holeArguments(helper.holes, side),
  ];
  return `${helper.name}(${args.join(', ')})`;
}

function replacement(side: number, own: Side, found: Found): Edit {
  const out = own.output;
  const declared =
    out === undefined ? '' : `${out.keyword} ${out.name}${out.annotated ? `: ${out.type}` : ''} = `;
  return { ...bounds(own.run), text: `${declared}${callText(side, found)}` };
}

function helperText(first: Side, { helper, inputs }: Found, text: string): string {
  const { start, end } = bounds(first.run);
  const { fn } = first.run;
  const [base, inner] = [indentOf(text, fn.startIndex), indentOf(text, start)];
  const { output } = first;
  const parameters = [
    ...inputs.map(({ names, type }) => `${names[0]}: ${type}`),
    ...holeParameters(helper.holes),
  ];
  const suspend = modifierWords(fn).includes('suspend') ? 'suspend ' : '';
  const returns = output === undefined ? '' : `: ${output.type}`;
  const tail = output === undefined ? '' : `\n${inner}return ${output.name}`;
  const body = replacedText({ startIndex: start, endIndex: end }, text, helper.holes);
  const signature = `private ${suspend}fun ${helper.name}(${parameters.join(', ')})${returns}`;
  return `${signature} {\n${inner}${body}${tail}\n${base}}`;
}

export function partialEdits(sides: Pair2, found: Found, text: string): Edit[] {
  const [first, second] = sides;
  return [
    replacement(0, first, found),
    replacement(1, second, found),
    insertionAfter(first.run.fn, helperText(first, found, text), text),
  ];
}
