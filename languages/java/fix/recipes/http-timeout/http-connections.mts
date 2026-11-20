import type { Source } from '../source/java-source.mts';
import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';
import { resolves, type Found } from './http-calls.mts';

const URL_TYPE = { simple: 'URL', fqn: 'java.net.URL' };
const MILLISECONDS = '10_000';
const DECLARATION = new RegExp(
  [
    /^([ \t]*)HttpURLConnection\s+([A-Za-z_]\w*)\s*=\s*/,
    /\(\s*HttpURLConnection\s*\)\s*([A-Za-z_]\w*)/,
    /\s*\.\s*openConnection\s*\(\s*\)\s*;/,
  ]
    .map(({ source }) => source)
    .join(''),
  'gmu',
);

type Use = {
  readonly code: string;
  readonly name: string;
  readonly from: number;
  readonly to: number;
};

function usedOnlyThroughCalls({ code, name, from, to }: Use): boolean {
  const uses = [
    ...code
      .slice(from, to)
      .matchAll(new RegExp(String.raw`(?<![\w.$])${escapeRegExp(name)}\b`, 'gu')),
  ];
  return uses.every(({ index }) => /^\s*\./u.test(code.slice(from + index + name.length, to)));
}

export function connectionFixes(source: Source): Found[] {
  const connection = { simple: 'HttpURLConnection', fqn: 'java.net.HttpURLConnection' };
  if (!(resolves(source, connection) && resolves(source, URL_TYPE))) {
    return [];
  }
  return [...source.code.matchAll(DECLARATION)].flatMap((found) => {
    const [whole = '', indent = '', name = '', receiver = ''] = found;
    const method = source.methods.find(
      ({ open, close }) => open < found.index && found.index < close,
    );
    const end = found.index + whole.length;
    const typed = new RegExp(String.raw`\bURL\s+${escapeRegExp(receiver)}\b`, 'u').test(
      source.code,
    );
    const body = method === undefined ? '' : source.code.slice(method.open, method.close);
    const settled =
      method !== undefined &&
      typed &&
      !body.includes('setReadTimeout') &&
      usedOnlyThroughCalls({ code: source.code, name, from: end, to: method.close });
    return settled
      ? [
          {
            at: found.index,
            edits: [
              {
                start: end,
                end,
                text: `\n${indent}${name}.setConnectTimeout(${MILLISECONDS});\n${indent}${name}.setReadTimeout(${MILLISECONDS});`,
              },
            ],
          },
        ]
      : [];
  });
}
