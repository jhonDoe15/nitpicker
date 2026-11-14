const KOTLIN_FILE = /\.kt$/u;
const RULE = { tool: 'detekt', rule: 'detekt.style.NewLineAtEndOfFile' };

function lineEndingOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export const kotlinFinalNewlineRecipe = {
  id: 'kotlin-final-newline',
  rules: [RULE],
  presets: ['kotlin'],
  scope: 'file',
  safety: 'safe',
  plan({ files }) {
    return {
      fixes: files
        .filter(
          ({ path: name, text }) => KOTLIN_FILE.test(name) && text !== '' && !text.endsWith('\n'),
        )
        .map(({ path: name, text }) => ({
          finding: { ...RULE, path: name, line: text.split('\n').length },
          edits: [
            {
              type: 'replace',
              path: name,
              start: text.length,
              end: text.length,
              text: lineEndingOf(text),
            },
          ],
        })),
    };
  },
};
