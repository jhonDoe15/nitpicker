const HTML_TAG = new RegExp(
  String.raw`<\/?(?:p|br|ul|ol|li|b|i|u|em|strong|code|a|h[1-6]|table|thead|tbody|tr|td|th|div|span|` +
    String.raw`blockquote|dl|dt|dd|sup|sub|tt|hr|img|small|big|caption)\b[^>\n]{0,200}>`,
  'giu',
);
const PRE_TAG = /<(\/?)pre\b[^>\n]{0,200}>/giu;
const ENTITY = /&#?\w+;/gu;
const FENCE = '```';
const JAVADOC_MARKER = /^\s*\*+/u;

function prose(text) {
  return text.replaceAll(HTML_TAG, ' ').replaceAll(ENTITY, ' ');
}

function preLines(line, state) {
  const lines = [];
  let start = 0;
  for (const { index, 0: tag, 1: closing } of line.matchAll(PRE_TAG)) {
    if ((closing === '/') === state.insidePre) {
      const piece = line.slice(start, index);
      lines.push(state.insidePre ? piece : prose(piece), FENCE);
      state.insidePre = !state.insidePre;
      start = index + tag.length;
    }
  }
  const rest = line.slice(start);
  return [...lines, state.insidePre ? rest : prose(rest)];
}

export function javadocText(text) {
  const state = { insidePre: false };
  return text
    .split('\n')
    .flatMap((raw) => preLines(raw.replace(JAVADOC_MARKER, ''), state))
    .join('\n');
}
