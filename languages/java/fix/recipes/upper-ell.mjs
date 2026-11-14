import { lineAt } from '../../../../shared/conventions/lines.mjs';

const JAVA_FILE = /\.java$/u;
const NAME_CHARACTER = String.raw`\p{L}\p{N}\p{M}\p{Pc}\p{Sc}`;
const TOKENS = new RegExp(
  [
    String.raw`\/\/[^\n]*`,
    String.raw`\/\*[\s\S]*?(?:\*\/|$)`,
    String.raw`"""(?:\\[\s\S]|[\s\S])*?(?:"""|$)`,
    String.raw`"(?:\\.|[^"\\\n])*"?`,
    String.raw`'(?:\\.|[^'\\\n])*'?`,
    String.raw`(?<long>(?<![${NAME_CHARACTER}.])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*)l(?![${NAME_CHARACTER}]))`,
    `[${NAME_CHARACTER}]+`,
  ].join('|'),
  'gu',
);

export function lowercaseEllOffsets(text) {
  return [...text.matchAll(TOKENS)]
    .filter(({ groups }) => groups.long !== undefined)
    .map((match) => match.index + match[0].length - 1);
}

export const upperEllRecipe = {
  id: 'java-upper-ell',
  rules: [{ tool: 'checkstyle', rule: 'UpperEll' }],
  presets: ['java'],
  scope: 'file',
  safety: 'safe',
  plan({ files }) {
    return {
      fixes: files
        .filter(({ path: name }) => JAVA_FILE.test(name))
        .flatMap(({ path: name, text }) =>
          lowercaseEllOffsets(text).map((offset) => ({
            finding: {
              tool: 'checkstyle',
              rule: 'UpperEll',
              path: name,
              line: lineAt(text, offset),
            },
            edits: [{ type: 'replace', path: name, start: offset, end: offset + 1, text: 'L' }],
          })),
        ),
    };
  },
};
